import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { embedUrl, parseYouTubeId } from '../../utils/youtube';
import { assertOwnedFiles, deleteIfOrphaned, fileRow } from './files.service';
import { notifyNotePublished, notifyVideoPublished } from '../notifications/notifications.events';
import type { Role } from '../users/roles';

type Actor = { id: string; role: Role; ip?: string };
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');

async function currentSessionId(db: Queryable) {
  const { rows } = await db.query('select id from academic_sessions where is_current');
  if (!rows[0]) throw new AppError(400, 'No academic session is current yet. Ask the administrator to set one.', 'NO_CURRENT_SESSION');
  return rows[0].id as string;
}

// A teacher may only post to a class and subject they are assigned to in the current session.
async function assertTeaches(db: Queryable, teacherId: string, classId: string, subjectId: string, sessionId: string) {
  const { rowCount } = await db.query(
    'select 1 from teaching_assignments where teacher_id = $1 and class_id = $2 and subject_id = $3 and session_id = $4',
    [teacherId, classId, subjectId, sessionId]);
  if (!rowCount) throw new AppError(403, 'You are not assigned to teach this subject in this class.', 'FORBIDDEN');
}

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;

// ---------------- lesson notes ----------------
const noteSelect = `
  select n.*, ${CLASS_NAME} as class_name, sb.name as subject_name, u.first_name, u.last_name,
         (select count(*)::int from lesson_note_files lf where lf.note_id = n.id) as file_count
    from lesson_notes n join classes c on c.id = n.class_id join subjects sb on sb.id = n.subject_id join users u on u.id = n.teacher_id`;
const noteRow = (r: any) => ({
  id: r.id, title: r.title, topic: r.topic, classId: r.class_id, className: r.class_name, subjectId: r.subject_id,
  subjectName: r.subject_name, teacherName: `${r.first_name} ${r.last_name}`, status: r.status,
  publishedAt: r.published_at, updatedAt: r.updated_at, fileCount: r.file_count,
});

async function noteFiles(db: Queryable, noteId: string) {
  const { rows } = await db.query(
    'select f.id, f.original_name, f.mime_type, f.size_bytes from lesson_note_files lf join files f on f.id = lf.file_id where lf.note_id = $1 order by f.original_name', [noteId]);
  return rows.map(fileRow);
}

export async function createNote(a: Actor, i: any) {
  const id = await withTransaction(async (c) => {
    const sessionId = await currentSessionId(c);
    await assertTeaches(c, a.id, i.classId, i.subjectId, sessionId);
    await assertOwnedFiles(c, a.id, i.fileIds, 'resource');
    const { rows } = await c.query(
      `insert into lesson_notes (teacher_id, session_id, class_id, subject_id, topic, title, body, status, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, case when $8 = 'published' then now() end) returning id`,
      [a.id, sessionId, i.classId, i.subjectId, i.topic || null, i.title, i.body, i.status]);
    if (i.fileIds.length) await c.query('insert into lesson_note_files (note_id, file_id) select $1, unnest($2::uuid[])', [rows[0].id, [...new Set(i.fileIds)]]);
    await audit({ actorId: a.id, action: 'lesson_note.created', entityType: 'lesson_note', entityId: rows[0].id, ip: a.ip }, c);
    return rows[0].id as string;
  });
  if (i.status === 'published') await notifyNotePublished(id);
  return getNote(a, id);
}

export async function updateNote(a: Actor, id: string, i: any) {
  const removed: string[] = [];
  await withTransaction(async (c) => {
    const cur = (await c.query('select * from lesson_notes where id = $1 and teacher_id = $2 for update', [id, a.id])).rows[0];
    if (!cur) throw notFound('Lesson note');
    const classId = i.classId ?? cur.class_id, subjectId = i.subjectId ?? cur.subject_id;
    if (classId !== cur.class_id || subjectId !== cur.subject_id) await assertTeaches(c, a.id, classId, subjectId, cur.session_id);
    await c.query(
      `update lesson_notes set class_id = $2, subject_id = $3, title = coalesce($4, title), topic = case when $5::boolean then $6 else topic end,
              body = coalesce($7, body), status = coalesce($8, status),
              published_at = case when coalesce($8, status) = 'published' then coalesce(published_at, now()) else published_at end,
              updated_at = now() where id = $1`,
      [id, classId, subjectId, i.title ?? null, 'topic' in i, i.topic || null, i.body ?? null, i.status ?? null]);
    if (i.fileIds) {
      await assertOwnedFiles(c, a.id, i.fileIds, 'resource');
      const keep = [...new Set<string>(i.fileIds)];
      const gone = await c.query('delete from lesson_note_files where note_id = $1 and not (file_id = any($2::uuid[])) returning file_id', [id, keep]);
      removed.push(...gone.rows.map((r) => r.file_id));
      await c.query('insert into lesson_note_files (note_id, file_id) select $1, unnest($2::uuid[]) on conflict do nothing', [id, keep]);
    }
    await audit({ actorId: a.id, action: 'lesson_note.updated', entityType: 'lesson_note', entityId: id, metadata: { status: i.status }, ip: a.ip }, c);
  });
  await deleteIfOrphaned(removed);
  if (i.status === 'published') await notifyNotePublished(id); // repeat publishes are skipped by the notification's dedupe key
  return getNote(a, id);
}

export async function listMyNotes(a: Actor, f: { status?: string; classId?: string }) {
  const { rows } = await query(
    `${noteSelect} where n.teacher_id = $1 and ($2::text is null or n.status = $2) and ($3::uuid is null or n.class_id = $3)
      order by n.updated_at desc`, [a.id, f.status ?? null, f.classId ?? null]);
  return rows.map(noteRow);
}

// Teacher: own notes. Admin: any. Student: published notes for their own class this session.
export async function getNote(a: Actor, id: string) {
  const { rows } = await query(`${noteSelect} where n.id = $1`, [id]);
  const n = rows[0];
  if (!n) throw notFound('Lesson note');
  let allowed = a.role === 'admin' || n.teacher_id === a.id;
  if (!allowed && a.role === 'student' && n.status === 'published') {
    allowed = !!(await query(
      `select 1 from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
        where e.student_id = $1 and e.class_id = $2 and e.session_id = $3 and e.status = 'active'`, [a.id, n.class_id, n.session_id])).rowCount;
  }
  if (!allowed) throw notFound('Lesson note');
  return { ...noteRow(n), body: n.body, files: await noteFiles(pool, id) };
}

// ---------------- video lessons ----------------
const videoSelect = `
  select v.*, ${CLASS_NAME} as class_name, sb.name as subject_name, u.first_name, u.last_name
    from video_lessons v join classes c on c.id = v.class_id join subjects sb on sb.id = v.subject_id join users u on u.id = v.teacher_id`;
const videoRow = (r: any) => ({
  id: r.id, title: r.title, topic: r.topic, description: r.description, instructions: r.instructions,
  youtubeId: r.youtube_id, embedUrl: embedUrl(r.youtube_id), classId: r.class_id, className: r.class_name,
  subjectId: r.subject_id, subjectName: r.subject_name, teacherName: `${r.first_name} ${r.last_name}`,
  status: r.status, publishedAt: r.published_at, updatedAt: r.updated_at,
});

export async function createVideo(a: Actor, i: any) {
  const id = await withTransaction(async (c) => {
    const sessionId = await currentSessionId(c);
    await assertTeaches(c, a.id, i.classId, i.subjectId, sessionId);
    const { rows } = await c.query(
      `insert into video_lessons (teacher_id, session_id, class_id, subject_id, topic, title, description, instructions, youtube_id, status, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, case when $10 = 'published' then now() end) returning id`,
      [a.id, sessionId, i.classId, i.subjectId, i.topic || null, i.title, i.description, i.instructions, parseYouTubeId(i.url), i.status]);
    await audit({ actorId: a.id, action: 'video_lesson.created', entityType: 'video_lesson', entityId: rows[0].id, ip: a.ip }, c);
    return rows[0].id as string;
  });
  if (i.status === 'published') await notifyVideoPublished(id);
  return getVideo(a, id);
}

export async function updateVideo(a: Actor, id: string, i: any) {
  await withTransaction(async (c) => {
    const cur = (await c.query('select * from video_lessons where id = $1 and teacher_id = $2 for update', [id, a.id])).rows[0];
    if (!cur) throw notFound('Video lesson');
    const classId = i.classId ?? cur.class_id, subjectId = i.subjectId ?? cur.subject_id;
    if (classId !== cur.class_id || subjectId !== cur.subject_id) await assertTeaches(c, a.id, classId, subjectId, cur.session_id);
    await c.query(
      `update video_lessons set class_id = $2, subject_id = $3, title = coalesce($4, title), topic = case when $5::boolean then $6 else topic end,
              description = coalesce($7, description), instructions = coalesce($8, instructions), youtube_id = coalesce($9, youtube_id),
              status = coalesce($10, status),
              published_at = case when coalesce($10, status) = 'published' then coalesce(published_at, now()) else published_at end,
              updated_at = now() where id = $1`,
      [id, classId, subjectId, i.title ?? null, 'topic' in i, i.topic || null, i.description ?? null, i.instructions ?? null,
       i.url ? parseYouTubeId(i.url) : null, i.status ?? null]);
    await audit({ actorId: a.id, action: 'video_lesson.updated', entityType: 'video_lesson', entityId: id, metadata: { status: i.status }, ip: a.ip }, c);
  });
  if (i.status === 'published') await notifyVideoPublished(id);
  return getVideo(a, id);
}

export async function deleteVideo(a: Actor, id: string) {
  const { rowCount } = await query('delete from video_lessons where id = $1 and teacher_id = $2', [id, a.id]);
  if (!rowCount) throw notFound('Video lesson');
  await audit({ actorId: a.id, action: 'video_lesson.deleted', entityType: 'video_lesson', entityId: id, ip: a.ip });
}

export async function listMyVideos(a: Actor, f: { status?: string; classId?: string }) {
  const { rows } = await query(
    `${videoSelect} where v.teacher_id = $1 and ($2::text is null or v.status = $2) and ($3::uuid is null or v.class_id = $3)
      order by v.updated_at desc`, [a.id, f.status ?? null, f.classId ?? null]);
  return rows.map(videoRow);
}

export async function getVideo(a: Actor, id: string) {
  const { rows } = await query(`${videoSelect} where v.id = $1`, [id]);
  const v = rows[0];
  if (!v) throw notFound('Video lesson');
  let allowed = a.role === 'admin' || v.teacher_id === a.id;
  if (!allowed && a.role === 'student' && v.status === 'published') {
    allowed = !!(await query(
      `select 1 from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
        where e.student_id = $1 and e.class_id = $2 and e.session_id = $3 and e.status = 'active'`, [a.id, v.class_id, v.session_id])).rowCount;
  }
  if (!allowed) throw notFound('Video lesson');
  return videoRow(v);
}

// ---------------- student learning feed ----------------
const inMyClass = (alias: string) => `exists (
    select 1 from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
     where e.student_id = $1 and e.status = 'active' and e.class_id = ${alias}.class_id and e.session_id = ${alias}.session_id)`;

export async function studentLearning(studentId: string, f: { subjectId?: string; q?: string }) {
  const params = [studentId, f.subjectId ?? null, f.q ? `%${f.q}%` : null];
  const filters = (a: string) => `and ($2::uuid is null or ${a}.subject_id = $2) and ($3::text is null or ${a}.title ilike $3 or ${a}.topic ilike $3)`;
  const notes = await query(`${noteSelect} where n.status = 'published' and ${inMyClass('n')} ${filters('n')} order by n.published_at desc`, params);
  const videos = await query(`${videoSelect} where v.status = 'published' and ${inMyClass('v')} ${filters('v')} order by v.published_at desc`, params);
  return { notes: notes.rows.map(noteRow), videos: videos.rows.map(videoRow) };
}
