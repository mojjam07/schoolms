import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { assertOwnedFiles, deleteIfOrphaned, fileRow } from '../learning/files.service';
import { notifyAssignmentPublished, notifyReturned, notifySubmissionReceived, rescheduleAssignmentNotices } from '../notifications/notifications.events';
import type { Role } from '../users/roles';

type Actor = { id: string; role: Role; ip?: string };
const notFound = (w = 'Assignment') => new AppError(404, `${w} not found`, 'NOT_FOUND');
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function currentSessionId(db: Queryable) {
  const { rows } = await db.query('select id from academic_sessions where is_current');
  if (!rows[0]) throw new AppError(400, 'No academic session is current yet. Ask the administrator to set one.', 'NO_CURRENT_SESSION');
  return rows[0].id as string;
}
async function assertTeaches(db: Queryable, teacherId: string, classId: string, subjectId: string, sessionId: string) {
  const { rowCount } = await db.query(
    'select 1 from teaching_assignments where teacher_id = $1 and class_id = $2 and subject_id = $3 and session_id = $4', [teacherId, classId, subjectId, sessionId]);
  if (!rowCount) throw new AppError(403, 'You are not assigned to teach this subject in this class.', 'FORBIDDEN');
}

const base = `
  select a.*, ${CLASS_NAME} as class_name, sb.name as subject_name, u.first_name, u.last_name
    from assignments a join classes c on c.id = a.class_id join subjects sb on sb.id = a.subject_id join users u on u.id = a.teacher_id`;
const asgRow = (r: any) => ({
  id: r.id, title: r.title, description: r.description, instructions: r.instructions, maxMarks: num(r.max_marks),
  publishAt: r.publish_at, dueAt: r.due_at, allowResubmission: r.allow_resubmission, status: r.status,
  classId: r.class_id, className: r.class_name, subjectId: r.subject_id, subjectName: r.subject_name,
  teacherName: `${r.first_name} ${r.last_name}`, updatedAt: r.updated_at,
});

// Visible to students once published (or closed, so feedback stays readable) and past its publication time.
const visible = (a: string) => `${a}.status in ('published', 'closed') and (${a}.publish_at is null or ${a}.publish_at <= now())`;
const inMyClass = (a: string) => `exists (
    select 1 from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
     where e.student_id = $1 and e.status = 'active' and e.class_id = ${a}.class_id and e.session_id = ${a}.session_id)`;

async function asgFiles(db: Queryable, id: string) {
  const { rows } = await db.query('select f.id, f.original_name, f.mime_type, f.size_bytes from assignment_files af join files f on f.id = af.file_id where af.assignment_id = $1 order by f.original_name', [id]);
  return rows.map(fileRow);
}

// ---------------- teacher: create, edit, list ----------------
export async function createAssignment(a: Actor, i: any) {
  const id = await withTransaction(async (c) => {
    const sessionId = await currentSessionId(c);
    await assertTeaches(c, a.id, i.classId, i.subjectId, sessionId);
    await assertOwnedFiles(c, a.id, i.fileIds, 'assignment');
    const { rows } = await c.query(
      `insert into assignments (teacher_id, session_id, class_id, subject_id, title, description, instructions, max_marks, publish_at, due_at, allow_resubmission, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [a.id, sessionId, i.classId, i.subjectId, i.title, i.description, i.instructions, i.maxMarks, i.publishAt ?? null, i.dueAt, i.allowResubmission, i.status]);
    if (i.fileIds.length) await c.query('insert into assignment_files (assignment_id, file_id) select $1, unnest($2::uuid[])', [rows[0].id, [...new Set(i.fileIds)]]);
    await audit({ actorId: a.id, action: 'assignment.created', entityType: 'assignment', entityId: rows[0].id, ip: a.ip }, c);
    return rows[0].id as string;
  });
  if (i.status === 'published') await notifyAssignmentPublished(id);
  return getAssignment(a, id);
}

export async function updateAssignment(a: Actor, id: string, i: any) {
  const removed: string[] = [];
  let wasDraft = false;
  await withTransaction(async (c) => {
    const cur = (await c.query('select * from assignments where id = $1 and teacher_id = $2 for update', [id, a.id])).rows[0];
    if (!cur) throw notFound();
    wasDraft = cur.status === 'draft';
    const classId = i.classId ?? cur.class_id, subjectId = i.subjectId ?? cur.subject_id;
    const moved = classId !== cur.class_id || subjectId !== cur.subject_id;
    if (moved) {
      const any = await c.query('select 1 from submissions where assignment_id = $1 limit 1', [id]);
      if (any.rowCount) throw new AppError(409, 'This assignment already has submissions, so its class and subject cannot change.', 'IN_USE');
      await assertTeaches(c, a.id, classId, subjectId, cur.session_id);
    }
    if (i.maxMarks !== undefined) {
      const top = (await c.query('select max(marks) as m from submissions where assignment_id = $1', [id])).rows[0].m;
      if (top !== null && Number(top) > i.maxMarks) throw new AppError(409, `Marks of ${Number(top)} have already been given, so the maximum cannot be lowered below that.`, 'IN_USE');
    }
    await c.query(
      `update assignments set class_id = $2, subject_id = $3, title = coalesce($4, title), description = coalesce($5, description),
              instructions = coalesce($6, instructions), max_marks = coalesce($7, max_marks),
              publish_at = case when $8::boolean then $9 else publish_at end, due_at = coalesce($10, due_at),
              allow_resubmission = coalesce($11, allow_resubmission), status = coalesce($12, status), updated_at = now() where id = $1`,
      [id, classId, subjectId, i.title ?? null, i.description ?? null, i.instructions ?? null, i.maxMarks ?? null,
       'publishAt' in i, i.publishAt ?? null, i.dueAt ?? null, i.allowResubmission ?? null, i.status ?? null]);
    if (i.fileIds) {
      await assertOwnedFiles(c, a.id, i.fileIds, 'assignment');
      const keep = [...new Set<string>(i.fileIds)];
      const gone = await c.query('delete from assignment_files where assignment_id = $1 and not (file_id = any($2::uuid[])) returning file_id', [id, keep]);
      removed.push(...gone.rows.map((r) => r.file_id));
      await c.query('insert into assignment_files (assignment_id, file_id) select $1, unnest($2::uuid[]) on conflict do nothing', [id, keep]);
    }
    await audit({ actorId: a.id, action: 'assignment.updated', entityType: 'assignment', entityId: id, metadata: { status: i.status }, ip: a.ip }, c);
  });
  await deleteIfOrphaned(removed);
  if ('publishAt' in i) await rescheduleAssignmentNotices(id, i.publishAt ?? null);
  if (wasDraft && i.status === 'published') await notifyAssignmentPublished(id);
  return getAssignment(a, id);
}

export async function listMyAssignments(a: Actor) {
  const { rows } = await query(
    `select x.*, ${CLASS_NAME} as class_name, sb.name as subject_name, u.first_name, u.last_name,
       (select count(*) from enrolments e where e.class_id = x.class_id and e.session_id = x.session_id and e.status = 'active')::int as enrolled,
       (select count(distinct s.student_id) from submissions s where s.assignment_id = x.id)::int as submitted,
       (select count(*) from (select distinct on (student_id) status from submissions where assignment_id = x.id order by student_id, attempt desc) l where l.status = 'submitted')::int as to_mark,
       (select count(*) from (select distinct on (student_id) is_late from submissions where assignment_id = x.id order by student_id, attempt desc) l where l.is_late)::int as late
     from assignments x join classes c on c.id = x.class_id join subjects sb on sb.id = x.subject_id join users u on u.id = x.teacher_id
     where x.teacher_id = $1 order by x.due_at desc`, [a.id]);
  return rows.map((r) => ({ ...asgRow(r), enrolledCount: r.enrolled, submittedCount: r.submitted, toMarkCount: r.to_mark, lateCount: r.late }));
}

// Teacher (own) and admin see everything; a student sees only published work for their own class.
export async function getAssignment(a: Actor, id: string) {
  const { rows } = await query(`${base} where a.id = $1`, [id]);
  const r = rows[0];
  if (!r) throw notFound();
  let allowed = a.role === 'admin' || r.teacher_id === a.id;
  if (!allowed && a.role === 'student') {
    allowed = !!(await query(`select 1 from assignments a where a.id = $2 and ${visible('a')} and ${inMyClass('a')}`, [a.id, id])).rowCount;
  }
  if (!allowed) throw notFound();
  return { ...asgRow(r), files: await asgFiles(pool, id) };
}

// ---------------- submissions ----------------
const attemptRow = (r: any, forStudent: boolean) => {
  const showGrade = !forStudent || r.status === 'returned';
  return {
    id: r.id, attempt: r.attempt, textResponse: r.text_response, submittedAt: r.submitted_at, isLate: r.is_late,
    // Students see "submitted" until the teacher returns the work; marks and feedback stay hidden until then.
    status: forStudent && r.status === 'graded' ? 'submitted' : r.status,
    marks: showGrade ? num(r.marks) : null, feedback: showGrade ? r.feedback : null, returnedAt: showGrade ? r.returned_at : null,
    files: r.files ?? [],
  };
};

async function attempts(db: Queryable, assignmentId: string, studentId: string, forStudent: boolean) {
  const { rows } = await db.query(
    `select s.*, coalesce((select json_agg(json_build_object('id', f.id, 'name', f.original_name, 'mimeType', f.mime_type, 'sizeBytes', f.size_bytes) order by f.original_name)
                             from submission_files sf join files f on f.id = sf.file_id where sf.submission_id = s.id), '[]'::json) as files
       from submissions s where s.assignment_id = $1 and s.student_id = $2 order by s.attempt`, [assignmentId, studentId]);
  return rows.map((r) => attemptRow(r, forStudent));
}

export async function mySubmission(a: Actor, assignmentId: string) {
  await getAssignment(a, assignmentId); // enforces "published and in my class"
  return { attempts: await attempts(pool, assignmentId, a.id, true) };
}

export async function submit(a: Actor, assignmentId: string, i: { textResponse: string; fileIds: string[] }) {
  const removed: string[] = [];
  const result = await withTransaction(async (c) => {
    const asg = (await c.query(`select a.* from assignments a where a.id = $2 and ${visible('a')} and ${inMyClass('a')} for share`, [a.id, assignmentId])).rows[0];
    if (!asg) throw notFound();
    if (asg.status === 'closed') throw new AppError(409, 'This assignment is closed and no longer accepts work.', 'CLOSED');
    if (!i.textResponse.trim() && !i.fileIds.length) throw new AppError(400, 'Write an answer or attach a file before submitting.', 'EMPTY_SUBMISSION');
    await assertOwnedFiles(c, a.id, i.fileIds, 'submission');
    const latest = (await c.query('select * from submissions where assignment_id = $1 and student_id = $2 order by attempt desc limit 1 for update', [assignmentId, a.id])).rows[0];
    const isLate = new Date() > new Date(asg.due_at);
    const files = [...new Set<string>(i.fileIds)];
    let id: string, attempt: number;

    if (!latest) {
      attempt = 1;
      id = (await c.query('insert into submissions (assignment_id, student_id, attempt, text_response, is_late) values ($1,$2,1,$3,$4) returning id', [assignmentId, a.id, i.textResponse, isLate])).rows[0].id;
    } else if (!asg.allow_resubmission) {
      throw new AppError(409, 'You have already submitted this assignment. Your teacher has not allowed resubmission.', 'ALREADY_SUBMITTED');
    } else if (latest.status === 'graded') {
      throw new AppError(409, 'Your teacher is marking this work right now. You can resubmit once it has been returned to you.', 'BEING_MARKED');
    } else if (latest.status === 'submitted') {
      // Not marked yet: replace the current attempt.
      attempt = latest.attempt; id = latest.id;
      const gone = await c.query('delete from submission_files where submission_id = $1 and not (file_id = any($2::uuid[])) returning file_id', [id, files]);
      removed.push(...gone.rows.map((r) => r.file_id));
      await c.query('update submissions set text_response = $2, submitted_at = now(), is_late = $3 where id = $1', [id, i.textResponse, isLate]);
    } else {
      // Returned with feedback: a new attempt, so the earlier marks are kept.
      attempt = latest.attempt + 1;
      id = (await c.query('insert into submissions (assignment_id, student_id, attempt, text_response, is_late) values ($1,$2,$3,$4,$5) returning id', [assignmentId, a.id, attempt, i.textResponse, isLate])).rows[0].id;
    }
    if (files.length) await c.query('insert into submission_files (submission_id, file_id) select $1, unnest($2::uuid[]) on conflict do nothing', [id, files]);
    await audit({ actorId: a.id, action: 'submission.submitted', entityType: 'assignment', entityId: assignmentId, metadata: { attempt, late: isLate }, ip: a.ip }, c);
    return { id, attempt, isLate };
  });
  await deleteIfOrphaned(removed);
  await notifySubmissionReceived(assignmentId, a.id, result.isLate, result.attempt);
  const list = await attempts(pool, assignmentId, a.id, true);
  const mine = list.find((x) => x.id === result.id)!;
  return { confirmation: { submissionId: result.id, attempt: result.attempt, submittedAt: mine.submittedAt, isLate: result.isLate }, attempts: list };
}

// ---------------- teacher: roster, marking ----------------
async function ownAssignment(a: Actor, id: string) {
  const asg = (await query('select * from assignments where id = $1', [id])).rows[0];
  if (!asg || (asg.teacher_id !== a.id && a.role !== 'admin')) throw notFound();
  return asg;
}

export async function roster(a: Actor, id: string) {
  const asg = await ownAssignment(a, id);
  const { rows } = await query(
    `select u.id, u.first_name, u.last_name, sp.admission_number, sub.id as sub_id, sub.attempt, sub.status, sub.is_late, sub.submitted_at, sub.marks
       from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
       left join lateral (select * from submissions s where s.assignment_id = $1 and s.student_id = e.student_id order by attempt desc limit 1) sub on true
      where e.class_id = $2 and e.session_id = $3 and e.status = 'active' order by u.last_name, u.first_name`, [id, asg.class_id, asg.session_id]);
  return rows.map((r) => ({
    studentId: r.id, name: `${r.first_name} ${r.last_name}`, admissionNumber: r.admission_number,
    submissionId: r.sub_id, attempt: r.attempt, status: r.status ?? 'not_submitted', isLate: r.is_late ?? false,
    submittedAt: r.submitted_at, marks: num(r.marks),
  }));
}

export async function studentSubmission(a: Actor, assignmentId: string, studentId: string) {
  await ownAssignment(a, assignmentId);
  const who = (await query('select first_name, last_name from users where id = $1', [studentId])).rows[0];
  if (!who) throw notFound('Student');
  return { studentName: `${who.first_name} ${who.last_name}`, attempts: await attempts(pool, assignmentId, studentId, false) };
}

export async function grade(a: Actor, submissionId: string, i: { marks: number; feedback: string; returnToStudent: boolean }) {
  let finalStatus = 'graded';
  await withTransaction(async (c) => {
    const s = (await c.query(
      `select s.*, a.teacher_id, a.max_marks, (select max(attempt) from submissions x where x.assignment_id = s.assignment_id and x.student_id = s.student_id) as newest
         from submissions s join assignments a on a.id = s.assignment_id where s.id = $1 for update of s`, [submissionId])).rows[0];
    if (!s || s.teacher_id !== a.id) throw notFound('Submission');
    if (s.attempt !== s.newest) throw new AppError(409, 'The student has submitted newer work. Mark the latest attempt instead.', 'SUPERSEDED');
    if (i.marks > Number(s.max_marks)) throw new AppError(400, `Marks cannot be more than the maximum of ${Number(s.max_marks)}.`, 'VALIDATION_ERROR', [{ field: 'marks', message: `Cannot be more than ${Number(s.max_marks)}` }]);
    const status = i.returnToStudent || s.status === 'returned' ? 'returned' : 'graded';
    finalStatus = status;
    await c.query(
      `update submissions set marks = $2, feedback = $3, status = $4, graded_by = $5, graded_at = now(),
              returned_at = case when $4 = 'returned' then coalesce(returned_at, now()) else returned_at end where id = $1`,
      [submissionId, i.marks, i.feedback, status, a.id]);
    await audit({ actorId: a.id, action: 'submission.graded', entityType: 'submission', entityId: submissionId, metadata: { status }, ip: a.ip }, c);
  });
  if (finalStatus === 'returned') await notifyReturned([submissionId]);
  return { saved: true };
}

export async function returnSubmission(a: Actor, submissionId: string) {
  const { rowCount } = await query(
    `update submissions s set status = 'returned', returned_at = coalesce(returned_at, now())
       from assignments x where s.id = $1 and x.id = s.assignment_id and x.teacher_id = $2 and s.marks is not null and s.status = 'graded'`, [submissionId, a.id]);
  if (!rowCount) throw new AppError(409, 'Only marked work that has not been returned yet can be returned.', 'INVALID_STATE');
  await audit({ actorId: a.id, action: 'submission.returned', entityType: 'submission', entityId: submissionId, ip: a.ip });
  await notifyReturned([submissionId]);
  return { returned: true };
}

export async function returnAllGraded(a: Actor, assignmentId: string) {
  await ownAssignment(a, assignmentId);
  const { rows } = await query(
    `update submissions s set status = 'returned', returned_at = coalesce(returned_at, now())
      where s.assignment_id = $1 and s.status = 'graded' and s.marks is not null returning s.id`, [assignmentId]);
  await audit({ actorId: a.id, action: 'assignment.returned_all', entityType: 'assignment', entityId: assignmentId, metadata: { count: rows.length }, ip: a.ip });
  await notifyReturned(rows.map((r) => r.id));
  return { returned: rows.length };
}

// ---------------- student list ----------------
export async function studentAssignments(studentId: string) {
  const { rows } = await query(
    `select a.*, ${CLASS_NAME} as class_name, sb.name as subject_name, u.first_name, u.last_name,
            sub.status as sub_status, sub.is_late, sub.submitted_at, sub.marks, sub.attempt
       from assignments a join classes c on c.id = a.class_id join subjects sb on sb.id = a.subject_id join users u on u.id = a.teacher_id
       left join lateral (select * from submissions s where s.assignment_id = a.id and s.student_id = $1 order by attempt desc limit 1) sub on true
      where ${visible('a')} and ${inMyClass('a')} order by a.due_at desc`, [studentId]);
  return rows.map((r) => {
    const returned = r.sub_status === 'returned';
    const state = !r.sub_status ? 'not_submitted' : returned ? 'returned' : 'submitted';
    return {
      ...asgRow(r), myStatus: state, myIsLate: r.is_late ?? false, mySubmittedAt: r.submitted_at, myAttempt: r.attempt ?? 0,
      myMarks: returned ? num(r.marks) : null,
      overdue: state === 'not_submitted' && new Date(r.due_at) < new Date(),
    };
  });
}
