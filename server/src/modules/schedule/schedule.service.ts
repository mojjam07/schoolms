import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { notifyUsers, parentsOfStudents, safely, studentsInClass } from '../notifications/notifications.service';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const hhmm = (col: string) => `to_char(${col}, 'HH24:MI')`;
const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');
type Ctx = { actorId: string; ip?: string };
export const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

async function currentSession(db: Queryable = pool) {
  const s = (await db.query('select id, name from academic_sessions where is_current')).rows[0];
  return s ? { id: s.id as string, name: s.name as string } : null;
}

// ======================= timetable =======================
const SLOT_SQL = `
  select t.id, t.session_id, t.class_id, t.subject_id, t.day_of_week, ${hhmm('t.start_time')} as start_time, ${hhmm('t.end_time')} as end_time, t.room,
         ${CLASS_NAME} as class_name, sb.name as subject_name,
         coalesce((select json_agg(u.first_name || ' ' || u.last_name order by u.last_name, u.first_name)
                     from teaching_assignments ta join users u on u.id = ta.teacher_id
                    where ta.session_id = t.session_id and ta.class_id = t.class_id and ta.subject_id = t.subject_id), '[]'::json) as teachers
    from timetable_entries t join classes c on c.id = t.class_id join subjects sb on sb.id = t.subject_id`;
const slotRow = (r: any) => ({
  id: r.id, sessionId: r.session_id, classId: r.class_id, className: r.class_name, subjectId: r.subject_id, subjectName: r.subject_name,
  dayOfWeek: r.day_of_week, dayName: DAYS[r.day_of_week], startTime: r.start_time, endTime: r.end_time, room: r.room, teachers: r.teachers as string[],
});
const ORDER = 'order by t.day_of_week, t.start_time, class_name';

export async function listTimetable(f: { sessionId: string; classId?: string; teacherId?: string }) {
  const { rows } = await query(
    `${SLOT_SQL} where t.session_id = $1 and ($2::uuid is null or t.class_id = $2)
       and ($3::uuid is null or exists (select 1 from teaching_assignments ta where ta.session_id = t.session_id and ta.class_id = t.class_id
                                           and ta.subject_id = t.subject_id and ta.teacher_id = $3)) ${ORDER}`,
    [f.sessionId, f.classId ?? null, f.teacherId ?? null]);
  return rows.map(slotRow);
}

type SlotInput = { sessionId: string; classId: string; subjectId: string; dayOfWeek: number; startTime: string; endTime: string; room?: string | null };

// Two lessons for one class cannot overlap, and a teacher cannot be in two classes at once.
async function assertNoClash(c: Queryable, s: SlotInput, ignoreId: string | null) {
  const same = (await c.query(
    `select ${hhmm('start_time')} as st, ${hhmm('end_time')} as en, (select name from subjects where id = t.subject_id) as subject
       from timetable_entries t
      where session_id = $1 and class_id = $2 and day_of_week = $3 and ($6::uuid is null or id <> $6)
        and start_time < $5::time and end_time > $4::time limit 1`,
    [s.sessionId, s.classId, s.dayOfWeek, s.startTime, s.endTime, ignoreId])).rows[0];
  if (same) throw new AppError(409, `This class already has ${same.subject} from ${same.st} to ${same.en} on ${DAYS[s.dayOfWeek]}.`, 'CLASS_CLASH');
  const t = (await c.query(
    `select u.first_name || ' ' || u.last_name as teacher, (select ${CLASS_NAME} from classes c where c.id = o.class_id) as class_name,
            ${hhmm('o.start_time')} as st, ${hhmm('o.end_time')} as en
       from teaching_assignments mine
       join teaching_assignments theirs on theirs.teacher_id = mine.teacher_id and theirs.session_id = mine.session_id
       join timetable_entries o on o.session_id = theirs.session_id and o.class_id = theirs.class_id and o.subject_id = theirs.subject_id
       join users u on u.id = mine.teacher_id
      where mine.session_id = $1 and mine.class_id = $2 and mine.subject_id = $7
        and o.day_of_week = $3 and o.start_time < $5::time and o.end_time > $4::time
        and not (o.class_id = $2 and o.subject_id = $7) and ($6::uuid is null or o.id <> $6) limit 1`,
    [s.sessionId, s.classId, s.dayOfWeek, s.startTime, s.endTime, ignoreId, s.subjectId])).rows[0];
  if (t) throw new AppError(409, `${t.teacher} already teaches ${t.class_name} from ${t.st} to ${t.en} on ${DAYS[s.dayOfWeek]}.`, 'TEACHER_CLASH');
}

const lock = (c: Queryable, key: string) => c.query('select pg_advisory_xact_lock(hashtext($1))', [key]);

export async function createSlot(i: SlotInput, ctx: Ctx) {
  const id = await withTransaction(async (c) => {
    await lock(c, `timetable:${i.sessionId}`);
    await assertNoClash(c, i, null);
    const ins = await c.query(
      `insert into timetable_entries (session_id, class_id, subject_id, day_of_week, start_time, end_time, room) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [i.sessionId, i.classId, i.subjectId, i.dayOfWeek, i.startTime, i.endTime, i.room?.trim() || null]).catch((e) => {
      if (e.code === '23503') throw new AppError(400, 'That subject is not taught in that class. Add it under Classes and subjects first.', 'SUBJECT_NOT_IN_CLASS');
      throw e;
    });
    await audit({ actorId: ctx.actorId, action: 'timetable.created', entityType: 'timetable_entry', entityId: ins.rows[0].id, metadata: i, ip: ctx.ip }, c);
    return ins.rows[0].id as string;
  });
  return slotRow((await query(`${SLOT_SQL} where t.id = $1`, [id])).rows[0]);
}

export async function updateSlot(id: string, p: Partial<Pick<SlotInput, 'dayOfWeek' | 'startTime' | 'endTime' | 'room'>>, ctx: Ctx) {
  await withTransaction(async (c) => {
    const cur = (await c.query(`select session_id, class_id, subject_id, day_of_week, ${hhmm('start_time')} as st, ${hhmm('end_time')} as en, room from timetable_entries where id = $1`, [id])).rows[0];
    if (!cur) throw notFound('Timetable slot');
    await lock(c, `timetable:${cur.session_id}`);
    const next: SlotInput = {
      sessionId: cur.session_id, classId: cur.class_id, subjectId: cur.subject_id, dayOfWeek: p.dayOfWeek ?? cur.day_of_week,
      startTime: p.startTime ?? cur.st, endTime: p.endTime ?? cur.en, room: p.room === undefined ? cur.room : p.room?.trim() || null,
    };
    if (next.endTime <= next.startTime) throw new AppError(400, 'The end time must be after the start time', 'VALIDATION_ERROR');
    await assertNoClash(c, next, id);
    await c.query('update timetable_entries set day_of_week = $2, start_time = $3, end_time = $4, room = $5 where id = $1', [id, next.dayOfWeek, next.startTime, next.endTime, next.room]);
    await audit({ actorId: ctx.actorId, action: 'timetable.updated', entityType: 'timetable_entry', entityId: id, metadata: p, ip: ctx.ip }, c);
  });
  return slotRow((await query(`${SLOT_SQL} where t.id = $1`, [id])).rows[0]);
}

export async function deleteSlot(id: string, ctx: Ctx) {
  const { rowCount } = await query('delete from timetable_entries where id = $1', [id]);
  if (!rowCount) throw notFound('Timetable slot');
  await audit({ actorId: ctx.actorId, action: 'timetable.deleted', entityType: 'timetable_entry', entityId: id, ip: ctx.ip });
}

// Clashes can appear after the fact (a teacher is assigned to a second class later), so the administrator can list them.
export async function timetableConflicts(sessionId: string) {
  const { rows } = await query(
    `select distinct u.first_name || ' ' || u.last_name as teacher, a.day_of_week,
            ${hhmm('a.start_time')} as a_start, ${hhmm('a.end_time')} as a_end, (select ${CLASS_NAME} from classes c where c.id = a.class_id) as a_class,
            ${hhmm('b.start_time')} as b_start, ${hhmm('b.end_time')} as b_end, (select ${CLASS_NAME} from classes c where c.id = b.class_id) as b_class
       from timetable_entries a
       join teaching_assignments ta on ta.session_id = a.session_id and ta.class_id = a.class_id and ta.subject_id = a.subject_id
       join teaching_assignments tb on tb.session_id = ta.session_id and tb.teacher_id = ta.teacher_id
       join timetable_entries b on b.session_id = tb.session_id and b.class_id = tb.class_id and b.subject_id = tb.subject_id
       join users u on u.id = ta.teacher_id
      where a.session_id = $1 and a.id < b.id and a.day_of_week = b.day_of_week and a.start_time < b.end_time and b.start_time < a.end_time
        and a.class_id <> b.class_id
      order by teacher, a.day_of_week`, [sessionId]);
  return rows.map((r) => ({
    teacher: r.teacher, dayName: DAYS[r.day_of_week],
    first: { className: r.a_class, startTime: r.a_start, endTime: r.a_end }, second: { className: r.b_class, startTime: r.b_start, endTime: r.b_end },
  }));
}

export async function studentTimetable(studentId: string) {
  const s = await currentSession();
  if (!s) return { session: null, className: null, entries: [] };
  const e = (await query(
    `select e.class_id, ${CLASS_NAME} as name from enrolments e join classes c on c.id = e.class_id
      where e.student_id = $1 and e.session_id = $2 and e.status = 'active'`, [studentId, s.id])).rows[0];
  if (!e) return { session: s, className: null, entries: [] };
  return { session: s, className: e.name as string, entries: await listTimetable({ sessionId: s.id, classId: e.class_id }) };
}

export async function teacherTimetable(teacherId: string) {
  const s = await currentSession();
  if (!s) return { session: null, className: null, entries: [] };
  return { session: s, className: null, entries: await listTimetable({ sessionId: s.id, teacherId }) };
}

// ======================= examinations =======================
const scheduleRow = (r: any) => ({
  id: r.id, termId: r.term_id, termName: r.term_name, sessionName: r.session_name, title: r.title,
  isPublished: r.is_published, publishedAt: r.published_at, paperCount: r.paper_count ?? undefined,
});
const SCHEDULE_SQL = `
  select x.*, (array['First Term','Second Term','Third Term'])[t.term_number] as term_name, s.name as session_name,
         (select count(*)::int from exam_papers p where p.schedule_id = x.id) as paper_count
    from exam_schedules x join terms t on t.id = x.term_id join academic_sessions s on s.id = t.session_id`;

const PAPER_SQL = `
  select p.id, p.schedule_id, p.class_id, p.subject_id, p.exam_date, ${hhmm('p.start_time')} as start_time, ${hhmm('p.end_time')} as end_time,
         p.venue, p.instructions, ${CLASS_NAME} as class_name, sb.name as subject_name, x.title as schedule_title, x.term_id, x.is_published,
         t.session_id, (array['First Term','Second Term','Third Term'])[t.term_number] as term_name
    from exam_papers p join exam_schedules x on x.id = p.schedule_id join terms t on t.id = x.term_id
    join classes c on c.id = p.class_id join subjects sb on sb.id = p.subject_id`;
const paperRow = (r: any) => ({
  id: r.id, scheduleId: r.schedule_id, scheduleTitle: r.schedule_title, termId: r.term_id, classId: r.class_id, className: r.class_name,
  subjectId: r.subject_id, subjectName: r.subject_name, date: r.exam_date, startTime: r.start_time, endTime: r.end_time, venue: r.venue, instructions: r.instructions,
});
const PAPER_ORDER = 'order by p.exam_date, p.start_time, class_name';

export async function listExamSchedules(termId?: string) {
  const { rows } = await query(`${SCHEDULE_SQL} where ($1::uuid is null or x.term_id = $1) order by x.created_at desc`, [termId ?? null]);
  return rows.map(scheduleRow);
}

export async function getExamSchedule(id: string) {
  const s = (await query(`${SCHEDULE_SQL} where x.id = $1`, [id])).rows[0];
  if (!s) throw notFound('Exam schedule');
  const papers = (await query(`${PAPER_SQL} where p.schedule_id = $1 ${PAPER_ORDER}`, [id])).rows.map(paperRow);
  return { ...scheduleRow(s), papers };
}

export async function createExamSchedule(i: { termId: string; title: string }, ctx: Ctx) {
  const ins = await query('insert into exam_schedules (term_id, title) values ($1, $2) returning id', [i.termId, i.title.trim()])
    .catch((e) => { if (e.code === '23503') throw notFound('Term'); throw e; });
  await audit({ actorId: ctx.actorId, action: 'exam_schedule.created', entityType: 'exam_schedule', entityId: ins.rows[0].id, metadata: i, ip: ctx.ip });
  return getExamSchedule(ins.rows[0].id);
}

export async function renameExamSchedule(id: string, title: string, ctx: Ctx) {
  const { rowCount } = await query('update exam_schedules set title = $2 where id = $1', [id, title.trim()]);
  if (!rowCount) throw notFound('Exam schedule');
  await audit({ actorId: ctx.actorId, action: 'exam_schedule.renamed', entityType: 'exam_schedule', entityId: id, ip: ctx.ip });
  return getExamSchedule(id);
}

export async function deleteExamSchedule(id: string, ctx: Ctx) {
  const cur = (await query('select is_published from exam_schedules where id = $1', [id])).rows[0];
  if (!cur) throw notFound('Exam schedule');
  if (cur.is_published) throw new AppError(409, 'Unpublish this schedule before deleting it, so families are not left looking at dates that vanish.', 'PUBLISHED');
  await query('delete from exam_schedules where id = $1', [id]);
  await audit({ actorId: ctx.actorId, action: 'exam_schedule.deleted', entityType: 'exam_schedule', entityId: id, ip: ctx.ip });
}

// ---- who is told ----
async function audienceForPapers(classSubjects: { classId: string; subjectId: string; sessionId: string }[]) {
  const students = new Set<string>(); const teachers = new Set<string>();
  for (const cs of classSubjects) {
    for (const s of await studentsInClass(pool, cs.classId, cs.sessionId)) students.add(s);
    const t = await query('select teacher_id from teaching_assignments where session_id = $1 and class_id = $2 and subject_id = $3', [cs.sessionId, cs.classId, cs.subjectId]);
    for (const r of t.rows) teachers.add(r.teacher_id);
  }
  const studentIds = [...students];
  return { studentIds, parentIds: await parentsOfStudents(pool, studentIds), teacherIds: [...teachers] };
}

async function notifyExam(kind: 'published' | 'changed' | 'added' | 'removed', scheduleTitle: string, papers: { classId: string; subjectId: string; sessionId: string }[],
  text: { title: string; body: string }, key: string) {
  await safely(`exam ${kind}`, async () => {
    const a = await audienceForPapers(papers);
    const base = { type: `exam_${kind}`, title: text.title, body: text.body, entityType: 'exam_schedule' };
    await notifyUsers(pool, a.studentIds, { ...base, link: '/student/exams', dedupeKey: `${key}:s` });
    await notifyUsers(pool, a.parentIds, { ...base, link: '/parent/exams', dedupeKey: `${key}:p` });
    await notifyUsers(pool, a.teacherIds, { ...base, link: '/teacher/exams', dedupeKey: `${key}:t` });
  });
}

const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export async function setExamPublished(id: string, publish: boolean, ctx: Ctx) {
  const sched = await withTransaction(async (c) => {
    const cur = (await c.query('select title, is_published from exam_schedules where id = $1 for update', [id])).rows[0];
    if (!cur) throw notFound('Exam schedule');
    if (publish) {
      const n = (await c.query('select count(*)::int as n from exam_papers where schedule_id = $1', [id])).rows[0].n;
      if (!n) throw new AppError(400, 'Add at least one paper before publishing.', 'EMPTY_SCHEDULE');
    }
    await c.query('update exam_schedules set is_published = $2, published_at = case when $2 then coalesce(published_at, now()) else published_at end where id = $1', [id, publish]);
    await audit({ actorId: ctx.actorId, action: publish ? 'exam_schedule.published' : 'exam_schedule.unpublished', entityType: 'exam_schedule', entityId: id, ip: ctx.ip }, c);
    return cur as { title: string; is_published: boolean };
  });
  // Told once, the first time it is published; unpublishing and republishing never notifies twice.
  if (publish && !sched.is_published) {
    const papers = (await query(`${PAPER_SQL} where p.schedule_id = $1`, [id])).rows.map((r) => ({ classId: r.class_id, subjectId: r.subject_id, sessionId: r.session_id }));
    await notifyExam('published', sched.title, papers, { title: `Exam timetable published: ${sched.title}`, body: 'Open Examinations to see your dates, times and venues.' }, `exam:${id}:published`);
  }
  return getExamSchedule(id);
}

// ---- papers ----
type PaperInput = { classId: string; subjectId: string; date: string; startTime: string; endTime: string; venue?: string | null; instructions?: string | null };

async function assertPaperOk(c: Queryable, scheduleId: string, p: PaperInput, ignoreId: string | null) {
  const term = (await c.query(
    `select t.start_date, t.end_date, t.session_id from exam_schedules x join terms t on t.id = x.term_id where x.id = $1`, [scheduleId])).rows[0];
  if (!term) throw notFound('Exam schedule');
  if (p.date < term.start_date || p.date > term.end_date) {
    throw new AppError(400, `The exam date must be inside the term (${term.start_date} to ${term.end_date}).`, 'OUTSIDE_TERM');
  }
  if (p.endTime <= p.startTime) throw new AppError(400, 'The end time must be after the start time', 'VALIDATION_ERROR');
  const clash = (await c.query(
    `select (select name from subjects where id = o.subject_id) as subject, ${hhmm('o.start_time')} as st, ${hhmm('o.end_time')} as en
       from exam_papers o where o.class_id = $1 and o.exam_date = $2 and o.start_time < $4::time and o.end_time > $3::time
        and ($5::uuid is null or o.id <> $5) limit 1`, [p.classId, p.date, p.startTime, p.endTime, ignoreId])).rows[0];
  if (clash) throw new AppError(409, `This class already has a ${clash.subject} paper from ${clash.st} to ${clash.en} that day.`, 'CLASS_CLASH');
  return term.session_id as string;
}

export async function addPaper(scheduleId: string, p: PaperInput, ctx: Ctx) {
  const { id, sessionId, published, title } = await withTransaction(async (c) => {
    const sc = (await c.query('select title, is_published from exam_schedules where id = $1 for update', [scheduleId])).rows[0];
    if (!sc) throw notFound('Exam schedule');
    const sessionId = await assertPaperOk(c, scheduleId, p, null);
    const ins = await c.query(
      `insert into exam_papers (schedule_id, class_id, subject_id, exam_date, start_time, end_time, venue, instructions) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [scheduleId, p.classId, p.subjectId, p.date, p.startTime, p.endTime, p.venue?.trim() || null, p.instructions?.trim() || null]).catch((e) => {
      if (e.code === '23503') throw new AppError(400, 'That subject is not taught in that class. Add it under Classes and subjects first.', 'SUBJECT_NOT_IN_CLASS');
      if (e.code === '23505') throw new AppError(409, 'This subject already has a paper for that class in this schedule. Edit the existing one instead.', 'DUPLICATE');
      throw e;
    });
    await audit({ actorId: ctx.actorId, action: 'exam_paper.created', entityType: 'exam_paper', entityId: ins.rows[0].id, metadata: { scheduleId, ...p }, ip: ctx.ip }, c);
    return { id: ins.rows[0].id as string, sessionId, published: sc.is_published as boolean, title: sc.title as string };
  });
  const paper = (await query(`${PAPER_SQL} where p.id = $1`, [id])).rows[0];
  if (published) {
    await notifyExam('added', title, [{ classId: p.classId, subjectId: p.subjectId, sessionId }],
      { title: `New exam paper: ${paper.subject_name}`, body: `${paper.class_name} · ${fmtDay(p.date)}, ${p.startTime} to ${p.endTime}` }, `exam-paper:${id}:added`);
  }
  return paperRow(paper);
}

export async function updatePaper(id: string, patch: Partial<Omit<PaperInput, 'classId' | 'subjectId'>>, ctx: Ctx) {
  const { published, title, sessionId, cur } = await withTransaction(async (c) => {
    const cur = (await c.query(
      `select p.*, to_char(p.start_time,'HH24:MI') as st, to_char(p.end_time,'HH24:MI') as en, x.title, x.is_published
         from exam_papers p join exam_schedules x on x.id = p.schedule_id where p.id = $1 for update of p`, [id])).rows[0];
    if (!cur) throw notFound('Exam paper');
    const next: PaperInput = {
      classId: cur.class_id, subjectId: cur.subject_id, date: patch.date ?? cur.exam_date, startTime: patch.startTime ?? cur.st, endTime: patch.endTime ?? cur.en,
      venue: patch.venue === undefined ? cur.venue : patch.venue?.trim() || null, instructions: patch.instructions === undefined ? cur.instructions : patch.instructions?.trim() || null,
    };
    const sessionId = await assertPaperOk(c, cur.schedule_id, next, id);
    await c.query('update exam_papers set exam_date=$2, start_time=$3, end_time=$4, venue=$5, instructions=$6, updated_at=now() where id=$1',
      [id, next.date, next.startTime, next.endTime, next.venue, next.instructions]);
    await audit({ actorId: ctx.actorId, action: 'exam_paper.updated', entityType: 'exam_paper', entityId: id, metadata: patch, ip: ctx.ip }, c);
    return { published: cur.is_published as boolean, title: cur.title as string, sessionId, cur };
  });
  const paper = (await query(`${PAPER_SQL} where p.id = $1`, [id])).rows[0];
  const changed = (patch.date && patch.date !== cur.exam_date) || (patch.startTime && patch.startTime !== cur.st) || (patch.endTime && patch.endTime !== cur.en) || (patch.venue !== undefined && (patch.venue?.trim() || null) !== cur.venue);
  if (published && changed) {
    const stamp = (await query('select (extract(epoch from updated_at) * 1000)::bigint as ms from exam_papers where id = $1', [id])).rows[0].ms;
    await notifyExam('changed', title, [{ classId: paper.class_id, subjectId: paper.subject_id, sessionId }],
      { title: `Exam changed: ${paper.subject_name}`, body: `${paper.class_name} · now ${fmtDay(paper.exam_date)}, ${paper.start_time} to ${paper.end_time}${paper.venue ? ` · ${paper.venue}` : ''}` }, `exam-paper:${id}:changed:${stamp}`);
  }
  return paperRow(paper);
}

export async function deletePaper(id: string, ctx: Ctx) {
  const paper = (await query(`${PAPER_SQL} where p.id = $1`, [id])).rows[0];
  if (!paper) throw notFound('Exam paper');
  await query('delete from exam_papers where id = $1', [id]);
  await audit({ actorId: ctx.actorId, action: 'exam_paper.deleted', entityType: 'exam_paper', entityId: id, ip: ctx.ip });
  if (paper.is_published) {
    await notifyExam('removed', paper.schedule_title, [{ classId: paper.class_id, subjectId: paper.subject_id, sessionId: paper.session_id }],
      { title: `Exam removed: ${paper.subject_name}`, body: `${paper.class_name} · the ${fmtDay(paper.exam_date)} paper is no longer on the timetable.` }, `exam-paper:${id}:removed`);
  }
}

// ---- reading, scoped to the person ----
const withDays = (rows: any[]) => rows.map((r) => ({ ...paperRow(r), termName: r.term_name }));

export async function studentExams(studentId: string, scope: 'upcoming' | 'all', limit = 100) {
  const { rows } = await query(
    `${PAPER_SQL} join enrolments e on e.student_id = $1 and e.session_id = t.session_id and e.class_id = p.class_id and e.status = 'active'
      where x.is_published and ($2 = 'all' or p.exam_date >= $3::date) ${PAPER_ORDER} limit ${Math.min(limit, 200)}`, [studentId, scope, lagosToday()]);
  return withDays(rows);
}

export async function teacherExams(teacherId: string, scope: 'upcoming' | 'all') {
  const { rows } = await query(
    `${PAPER_SQL} join teaching_assignments ta on ta.teacher_id = $1 and ta.session_id = t.session_id and ta.class_id = p.class_id and ta.subject_id = p.subject_id
      where x.is_published and ($2 = 'all' or p.exam_date >= $3::date) ${PAPER_ORDER}`, [teacherId, scope, lagosToday()]);
  return withDays(rows);
}
