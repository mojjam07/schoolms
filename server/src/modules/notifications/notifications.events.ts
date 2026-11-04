import { pool, query } from '../../db/pool';
import { fmtLagos } from '../../utils/dates';
import { notifyUsers, parentsOfStudents, safely, studentsInClass } from './notifications.service';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const marksText = (m: unknown, max: unknown) => `${Number(m)} / ${Number(max)}`;

// ---- lesson notes and video lessons: told once, the first time they are published ----
export const notifyNotePublished = (id: string) => safely('note published', async () => {
  const n = (await query(
    `select n.*, ${CLASS_NAME} as cls, sb.name as subject, u.first_name, u.last_name from lesson_notes n join classes c on c.id = n.class_id
       join subjects sb on sb.id = n.subject_id join users u on u.id = n.teacher_id where n.id = $1 and n.status = 'published'`, [id])).rows[0];
  if (!n) return;
  await notifyUsers(pool, await studentsInClass(pool, n.class_id, n.session_id), {
    type: 'lesson_note_published', title: `New lesson note: ${n.title}`, body: `${n.subject} · ${n.first_name} ${n.last_name}`,
    link: '/student/learning', entityType: 'lesson_note', entityId: id, dedupeKey: `note:${id}:published`,
  });
});

export const notifyVideoPublished = (id: string) => safely('video published', async () => {
  const v = (await query(
    `select v.*, sb.name as subject, u.first_name, u.last_name from video_lessons v
       join subjects sb on sb.id = v.subject_id join users u on u.id = v.teacher_id where v.id = $1 and v.status = 'published'`, [id])).rows[0];
  if (!v) return;
  await notifyUsers(pool, await studentsInClass(pool, v.class_id, v.session_id), {
    type: 'video_lesson_published', title: `New video lesson: ${v.title}`, body: `${v.subject} · ${v.first_name} ${v.last_name}`,
    link: '/student/learning', entityType: 'video_lesson', entityId: id, dedupeKey: `video:${id}:published`,
  });
});

// ---- assignments ----
export const notifyAssignmentPublished = (id: string) => safely('assignment published', async () => {
  const a = (await query(
    `select a.*, ${CLASS_NAME} as cls, sb.name as subject from assignments a join classes c on c.id = a.class_id
       join subjects sb on sb.id = a.subject_id where a.id = $1 and a.status = 'published'`, [id])).rows[0];
  if (!a) return;
  // A scheduled assignment's notice only appears once students can see the assignment itself.
  const availableAt = a.publish_at && new Date(a.publish_at) > new Date() ? a.publish_at : null;
  const students = await studentsInClass(pool, a.class_id, a.session_id);
  await notifyUsers(pool, students, {
    type: 'assignment_published', title: `New assignment: ${a.title}`, body: `${a.subject}. Due ${fmtLagos(a.due_at)}.`,
    link: `/student/assignments/${id}`, entityType: 'assignment', entityId: id, dedupeKey: `assignment:${id}:published`, availableAt,
  });
  await notifyUsers(pool, await parentsOfStudents(pool, students), {
    type: 'assignment_published', title: `New assignment for ${a.cls}`, body: `${a.title} (${a.subject}) is due ${fmtLagos(a.due_at)}.`,
    link: '/parent', entityType: 'assignment', entityId: id, dedupeKey: `assignment:${id}:published:parent`, availableAt,
  });
});

// If the teacher moves the publication time, notices that have not appeared yet follow it.
export const rescheduleAssignmentNotices = (id: string, publishAt: Date | string | null) => safely('reschedule', async () => {
  const when = publishAt && new Date(publishAt) > new Date() ? publishAt : null;
  await query(
    `update notifications set available_at = coalesce($2::timestamptz, now())
      where entity_type = 'assignment' and entity_id = $1 and type = 'assignment_published' and available_at > now()`, [id, when]);
});

export const notifySubmissionReceived = (assignmentId: string, studentId: string, isLate: boolean, attempt: number) => safely('submission received', async () => {
  const a = (await query('select title from assignments where id = $1', [assignmentId])).rows[0];
  if (!a) return;
  await notifyUsers(pool, [studentId], {
    type: 'submission_received', title: `Work received: ${a.title}`, body: isLate ? 'Handed in after the deadline, so it is marked as late.' : 'Handed in on time.',
    link: `/student/assignments/${assignmentId}`, entityType: 'assignment', entityId: assignmentId,
    dedupeKey: `submission:${assignmentId}:${studentId}:${attempt}:${Date.now()}`,
  });
});

export const notifyReturned = (submissionIds: string[]) => safely('marks returned', async () => {
  if (!submissionIds.length) return;
  const { rows } = await query(
    `select s.id, s.student_id, s.marks, a.id as aid, a.title, a.max_marks, sb.name as subject, u.first_name
       from submissions s join assignments a on a.id = s.assignment_id join subjects sb on sb.id = a.subject_id join users u on u.id = s.student_id
      where s.id = any($1::uuid[]) and s.status = 'returned'`, [submissionIds]);
  for (const r of rows) {
    await notifyUsers(pool, [r.student_id], {
      type: 'marks_returned', title: `Marks returned: ${r.title}`, body: `You scored ${marksText(r.marks, r.max_marks)}. Open it to read your teacher's feedback.`,
      link: `/student/assignments/${r.aid}`, entityType: 'submission', entityId: r.id, dedupeKey: `submission:${r.id}:returned`,
    });
    await notifyUsers(pool, await parentsOfStudents(pool, [r.student_id]), {
      type: 'marks_returned', title: `${r.first_name}'s work was marked: ${r.title}`, body: `${r.first_name} scored ${marksText(r.marks, r.max_marks)} in ${r.subject}.`,
      link: '/parent', entityType: 'submission', entityId: r.id, dedupeKey: `submission:${r.id}:returned:parent`,
    });
  }
});

// ---- reminder job: assignments due within 24 hours, for students who have not handed anything in ----
export async function sendDueSoonReminders() {
  const { rowCount } = await query(
    `insert into notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key)
     select e.student_id, 'assignment_due_soon', 'Due soon: ' || a.title,
            'Due ' || to_char(a.due_at at time zone 'Africa/Lagos', 'DD Mon YYYY, HH12:MI AM') || '. You have not handed this in yet.',
            '/student/assignments/' || a.id, 'assignment', a.id, 'assignment:' || a.id || ':due-soon'
       from assignments a join academic_sessions s on s.id = a.session_id and s.is_current
       join enrolments e on e.class_id = a.class_id and e.session_id = a.session_id and e.status = 'active'
      where a.status = 'published' and (a.publish_at is null or a.publish_at <= now()) and a.due_at > now() and a.due_at <= now() + interval '24 hours'
        and not exists (select 1 from submissions sb where sb.assignment_id = a.id and sb.student_id = e.student_id)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`);
  return rowCount ?? 0;
}

export function startReminderJob() {
  const run = () => sendDueSoonReminders().then((n) => n && console.log(`[reminders] ${n} due-soon notice(s) created`)).catch((e) => console.error('[reminders] failed:', e.message));
  run();
  setInterval(run, 15 * 60 * 1000).unref(); // duplicates are impossible, so several instances running this is harmless
}
