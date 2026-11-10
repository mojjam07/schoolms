import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { notifyOne, safely } from '../notifications/notifications.service';
import { assertRole } from '../academic/academic.service';
import type { Role } from '../users/roles';

type Actor = { id: string; role: Role; ip?: string };
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const EDIT_WINDOW_DAYS = 7; // a form teacher can correct a register for a week; after that only the administrator can
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');
export const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
const dayName = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// The term a date falls in. When a class is given, only terms of a session that class belongs to count; the current session wins a tie.
async function termOn(db: Queryable, date: string, classId?: string) {
  const t = (await db.query(
    `select t.id, t.session_id, t.term_number, s.name as session_name from terms t join academic_sessions s on s.id = t.session_id
      where t.start_date <= $1 and t.end_date >= $1 and ($2::uuid is null or exists (select 1 from enrolments e where e.session_id = t.session_id and e.class_id = $2))
      order by s.is_current desc, t.start_date desc limit 1`, [date, classId ?? null])).rows[0];
  if (!t) throw new AppError(400, 'That date is not inside any term. Check the term dates under Sessions and terms.', 'NO_TERM');
  return { id: t.id as string, sessionId: t.session_id as string };
}
const isFormTeacher = async (db: Queryable, teacherId: string, classId: string, sessionId: string) =>
  !!(await db.query('select 1 from class_form_teachers where teacher_id = $1 and class_id = $2 and session_id = $3', [teacherId, classId, sessionId])).rowCount;

// ---------------- form teachers ----------------
export async function listFormTeachers(sessionId: string) {
  const { rows } = await query(
    `select c.id as class_id, ${CLASS_NAME} as class_name, f.teacher_id, u.first_name, u.last_name
       from classes c left join class_form_teachers f on f.class_id = c.id and f.session_id = $1 left join users u on u.id = f.teacher_id
      order by c.stage desc, c.year, c.arm nulls first`, [sessionId]);
  return rows.map((r) => ({ classId: r.class_id, className: r.class_name, teacherId: r.teacher_id, teacherName: r.teacher_id ? `${r.first_name} ${r.last_name}` : null }));
}
export async function setFormTeacher(i: { classId: string; sessionId: string; teacherId: string | null }, actor: Actor) {
  if (i.teacherId === null) await query('delete from class_form_teachers where class_id = $1 and session_id = $2', [i.classId, i.sessionId]);
  else {
    await assertRole(pool, i.teacherId, 'teacher');
    await query('insert into class_form_teachers (class_id, session_id, teacher_id) values ($1,$2,$3) on conflict (class_id, session_id) do update set teacher_id = excluded.teacher_id', [i.classId, i.sessionId, i.teacherId]);
  }
  await audit({ actorId: actor.id, action: 'form_teacher.set', entityType: 'class', entityId: i.classId, metadata: { sessionId: i.sessionId, teacherId: i.teacherId }, ip: actor.ip });
  return listFormTeachers(i.sessionId);
}
export async function myFormClasses(teacherId: string) {
  const { rows } = await query(`select c.id, ${CLASS_NAME} as name from class_form_teachers f join classes c on c.id = f.class_id join academic_sessions s on s.id = f.session_id and s.is_current where f.teacher_id = $1 order by name`, [teacherId]);
  return rows.map((r) => ({ classId: r.id, className: r.name }));
}

// ---------------- the daily register ----------------
async function authorise(actor: Actor, classId: string, sessionId: string) {
  if (actor.role === 'admin') return;
  if (!(await isFormTeacher(pool, actor.id, classId, sessionId))) throw new AppError(403, 'Only the form teacher of this class can take its register.', 'FORBIDDEN');
}
async function roster(db: Queryable, classId: string, sessionId: string) {
  return (await db.query(
    `select u.id, u.first_name, u.last_name, sp.admission_number from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
      where e.class_id = $1 and e.session_id = $2 and e.status = 'active' order by u.last_name, u.first_name`, [classId, sessionId])).rows;
}

export async function getRegister(actor: Actor, classId: string, date: string) {
  const term = await termOn(pool, date, classId);
  await authorise(actor, classId, term.sessionId);
  if (date > lagosToday()) throw new AppError(400, 'A register cannot be taken for a future date.', 'VALIDATION_ERROR');
  const reg = (await query('select id from attendance_registers where class_id = $1 and date = $2', [classId, date])).rows[0];
  const recs = reg ? new Map((await query('select student_id, status from attendance_records where register_id = $1', [reg.id])).rows.map((r) => [r.student_id, r.status])) : new Map();
  const students = await roster(pool, classId, term.sessionId);
  const className = (await query(`select ${CLASS_NAME} as n from classes c where c.id = $1`, [classId])).rows[0]?.n;
  if (!className) throw notFound('Class');
  return {
    classId, className, date, taken: !!reg, termId: term.id,
    locked: actor.role !== 'admin' && daysBetween(date, lagosToday()) > EDIT_WINDOW_DAYS,
    students: students.map((s) => ({ studentId: s.id, name: `${s.first_name} ${s.last_name}`, admissionNumber: s.admission_number, status: (recs.get(s.id) as string | undefined) ?? null })),
  };
}

export async function saveRegister(actor: Actor, i: { classId: string; date: string; entries: { studentId: string; status: 'present' | 'late' | 'absent' }[] }) {
  if (i.date > lagosToday()) throw new AppError(400, 'A register cannot be taken for a future date.', 'VALIDATION_ERROR');
  const term = await termOn(pool, i.date, i.classId);
  await authorise(actor, i.classId, term.sessionId);
  if (actor.role !== 'admin' && daysBetween(i.date, lagosToday()) > EDIT_WINDOW_DAYS) throw new AppError(409, `Registers can only be changed for ${EDIT_WINDOW_DAYS} days. Ask the administrator to correct this one.`, 'LOCKED');
  const students = await roster(pool, i.classId, term.sessionId);
  const want = new Set(students.map((s) => s.id as string)); const got = i.entries.map((e) => e.studentId);
  if (new Set(got).size !== got.length || got.length !== want.size || got.some((g) => !want.has(g))) {
    throw new AppError(400, 'The register must list every student in the class exactly once. Reload the page and try again.', 'VALIDATION_ERROR');
  }
  const changes: { studentId: string; from: string | null; to: string }[] = [];
  await withTransaction(async (c) => {
    const reg = (await c.query(
      `insert into attendance_registers (class_id, term_id, date, taken_by) values ($1,$2,$3,$4)
       on conflict (class_id, date) do update set taken_by = excluded.taken_by, updated_at = now() returning id`, [i.classId, term.id, i.date, actor.id])).rows[0];
    const old = new Map((await c.query('select student_id, status from attendance_records where register_id = $1', [reg.id])).rows.map((r) => [r.student_id, r.status]));
    await c.query(
      `insert into attendance_records (register_id, student_id, status) select $1, x.s, x.st from unnest($2::uuid[], $3::text[]) as x(s, st)
       on conflict (register_id, student_id) do update set status = excluded.status`, [reg.id, i.entries.map((e) => e.studentId), i.entries.map((e) => e.status)]);
    for (const e of i.entries) if ((old.get(e.studentId) ?? null) !== e.status) changes.push({ studentId: e.studentId, from: (old.get(e.studentId) as string) ?? null, to: e.status });
    await audit({ actorId: actor.id, action: old.size ? 'attendance.corrected' : 'attendance.taken', entityType: 'class', entityId: i.classId, metadata: { date: i.date, students: i.entries.length, ...(old.size ? { changes } : {}) }, ip: actor.ip }, c);
  });
  await safely('attendance notices', async () => {
    for (const ch of changes.filter((x) => x.to !== 'present')) {
      const kid = (await query('select first_name from users where id = $1', [ch.studentId])).rows[0]; if (!kid) continue;
      for (const p of (await query("select u.id from parent_students ps join users u on u.id = ps.parent_id where ps.student_id = $1 and u.status = 'active'", [ch.studentId])).rows) {
        await notifyOne(pool, p.id, { type: 'attendance_notice', title: `${kid.first_name} was marked ${ch.to} on ${dayName(i.date)}`, body: ch.to === 'absent' ? 'If there is a reason, you can explain it under Attendance.' : 'Arrived after the register was taken.', link: '/parent/attendance', entityType: 'student', entityId: ch.studentId, dedupeKey: `attendance:${ch.studentId}:${i.date}:${ch.to}` });
      }
    }
  });
  return getRegister(actor, i.classId, i.date);
}

// ---------------- summaries ----------------
// "Present" counts on-time and late arrivals (they were in school); the school opened on every register that lists the student.
const COUNTS = `count(*)::int as opened, count(*) filter (where ar.status = 'present')::int as on_time, count(*) filter (where ar.status = 'late')::int as late,
                count(*) filter (where ar.status = 'absent')::int as absent,
                count(*) filter (where ar.status = 'absent' and ex.status = 'accepted')::int as excused`;
const shape = (r: any) => ({ opened: r.opened, present: r.on_time + r.late, onTime: r.on_time, late: r.late, absent: r.absent, excused: r.excused, unexplainedAbsent: r.absent - r.excused, percentPresent: r.opened ? Math.round(((r.on_time + r.late) / r.opened) * 1000) / 10 : null });

export async function studentSummary(studentId: string, termId: string) {
  const { rows } = await query(
    `select ${COUNTS} from attendance_records ar join attendance_registers r on r.id = ar.register_id
       left join absence_explanations ex on ex.student_id = ar.student_id and ex.date = r.date where ar.student_id = $1 and r.term_id = $2`, [studentId, termId]);
  return shape(rows[0]);
}

export async function studentDays(studentId: string, termId: string) {
  const { rows } = await query(
    `select r.date, ar.status, ex.id as ex_id, ex.status as ex_status, ex.reason, ex.review_note
       from attendance_records ar join attendance_registers r on r.id = ar.register_id left join absence_explanations ex on ex.student_id = ar.student_id and ex.date = r.date
      where ar.student_id = $1 and r.term_id = $2 and ar.status <> 'present' order by r.date desc`, [studentId, termId]);
  return rows.map((r) => ({ date: r.date, status: r.status, explanation: r.ex_id ? { id: r.ex_id, status: r.ex_status, reason: r.reason, reviewNote: r.review_note } : null }));
}

export async function classSummary(actor: Actor, classId: string, termId: string) {
  const t = (await query('select session_id from terms where id = $1', [termId])).rows[0];
  if (!t) throw notFound('Term');
  await authorise(actor, classId, t.session_id);
  const students = (await query(
    `select u.id, u.first_name, u.last_name, sp.admission_number from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
      where e.class_id = $1 and e.session_id = $2 and e.status in ('active', 'graduated') order by u.last_name, u.first_name`, [classId, t.session_id])).rows;
  const days = (await query('select count(*)::int as n from attendance_registers where class_id = $1 and term_id = $2', [classId, termId])).rows[0].n as number;
  const out = [];
  for (const s of students) out.push({ studentId: s.id, name: `${s.first_name} ${s.last_name}`, admissionNumber: s.admission_number, ...(await studentSummary(s.id, termId)) });
  return { classId, termId, registersTaken: days, students: out };
}

// Which classes have had their register taken on a day.
export async function dayStatus(date: string) {
  const term = await termOn(pool, date);
  const { rows } = await query(
    `select c.id, ${CLASS_NAME} as name, u.first_name, u.last_name, r.id as reg,
            (select count(*) from attendance_records a where a.register_id = r.id and a.status = 'present')::int as present,
            (select count(*) from attendance_records a where a.register_id = r.id and a.status = 'late')::int as late,
            (select count(*) from attendance_records a where a.register_id = r.id and a.status = 'absent')::int as absent
       from classes c left join class_form_teachers f on f.class_id = c.id and f.session_id = $2 left join users u on u.id = f.teacher_id
       left join attendance_registers r on r.class_id = c.id and r.date = $1
      where exists (select 1 from enrolments e where e.class_id = c.id and e.session_id = $2 and e.status = 'active') order by c.stage desc, c.year, c.arm nulls first`, [date, term.sessionId]);
  return rows.map((r) => ({ classId: r.id, className: r.name, formTeacher: r.first_name ? `${r.first_name} ${r.last_name}` : null, taken: !!r.reg, present: r.present, late: r.late, absent: r.absent }));
}

// ---------------- absence explanations ----------------
export async function submitExplanation(parent: Actor, studentId: string, date: string, reason: string) {
  const link = await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [parent.id, studentId]);
  if (!link.rowCount) throw notFound('Child'); // the same answer as "no such child"
  const rec = (await query(`select ar.status from attendance_records ar join attendance_registers r on r.id = ar.register_id where ar.student_id = $1 and r.date = $2`, [studentId, date])).rows[0];
  if (!rec || rec.status === 'present') throw new AppError(400, 'No absence or late arrival was recorded for that date.', 'VALIDATION_ERROR', [{ field: 'date', message: 'No absence was recorded on this date' }]);
  const cur = (await query('select id, status from absence_explanations where student_id = $1 and date = $2', [studentId, date])).rows[0];
  if (cur && cur.status !== 'pending') throw new AppError(409, 'The school has already replied to this explanation.', 'ALREADY_REVIEWED');
  const row = cur
    ? (await query('update absence_explanations set reason = $2, submitted_by = $3, updated_at = now() where id = $1 returning *', [cur.id, reason, parent.id])).rows[0]
    : (await query('insert into absence_explanations (student_id, date, reason, submitted_by) values ($1,$2,$3,$4) returning *', [studentId, date, reason, parent.id])).rows[0];
  await audit({ actorId: parent.id, action: 'absence_explanation.submitted', entityType: 'student', entityId: studentId, metadata: { date }, ip: parent.ip });
  await safely('explanation notice', async () => {
    const t = (await query('select f.teacher_id, c.id as class_id from attendance_records ar join attendance_registers r on r.id = ar.register_id join terms tm on tm.id = r.term_id join class_form_teachers f on f.class_id = r.class_id and f.session_id = tm.session_id join classes c on c.id = r.class_id where ar.student_id = $1 and r.date = $2', [studentId, date])).rows[0];
    const kid = (await query('select first_name from users where id = $1', [studentId])).rows[0];
    if (t) await notifyOne(pool, t.teacher_id, { type: 'absence_explanation', title: `Absence explanation for ${kid.first_name}`, body: `${dayName(date)}: ${reason.slice(0, 120)}`, link: '/teacher/attendance/explanations', entityType: 'student', entityId: studentId, dedupeKey: `explanation:${row.id}:submitted` });
  });
  return { id: row.id as string, date, status: row.status as string };
}

export async function listExplanations(actor: Actor, status?: string) {
  const { rows } = await query(
    `select ex.*, u.first_name, u.last_name, p.first_name as pf, p.last_name as pl, ${CLASS_NAME} as class_name, ar.status as att_status, r.class_id
       from absence_explanations ex join users u on u.id = ex.student_id join users p on p.id = ex.submitted_by
       join attendance_records ar on ar.student_id = ex.student_id join attendance_registers r on r.id = ar.register_id and r.date = ex.date
       join classes c on c.id = r.class_id join terms tm on tm.id = r.term_id
      where ($1::text is null or ex.status = $1)
        and ($2::boolean or exists (select 1 from class_form_teachers f where f.class_id = r.class_id and f.session_id = tm.session_id and f.teacher_id = $3))
      order by ex.created_at desc limit 200`, [status ?? null, actor.role === 'admin', actor.id]);
  return rows.map((r) => ({ id: r.id, studentName: `${r.first_name} ${r.last_name}`, className: r.class_name, date: r.date, attendance: r.att_status, reason: r.reason, submittedBy: `${r.pf} ${r.pl}`, status: r.status, reviewNote: r.review_note, submittedAt: r.created_at }));
}

export async function reviewExplanation(actor: Actor, id: string, i: { status: 'accepted' | 'declined'; note?: string }) {
  const ex = (await listExplanations(actor)).find((e) => e.id === id); // only explanations this person may review are listed
  if (!ex) throw notFound('Explanation');
  const { rows } = await query(
    `update absence_explanations set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() where id = $1 returning student_id, date, submitted_by`, [id, i.status, i.note || null, actor.id]);
  await audit({ actorId: actor.id, action: `absence_explanation.${i.status}`, entityType: 'student', entityId: rows[0].student_id, metadata: { date: rows[0].date }, ip: actor.ip });
  await safely('explanation reply', async () => {
    await notifyOne(pool, rows[0].submitted_by, { type: 'absence_reviewed', title: `Absence explanation ${i.status}: ${ex.studentName}`, body: `${dayName(rows[0].date)}.${i.note ? ` ${i.note}` : ''}`, link: '/parent/attendance', entityType: 'absence_explanation', entityId: id, dedupeKey: `explanation:${id}:${i.status}` });
  });
  return { id, status: i.status };
}
