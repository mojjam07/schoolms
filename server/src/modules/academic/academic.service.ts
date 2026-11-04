import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import type { Role } from '../users/roles';

const TERM_NAMES = ['First Term', 'Second Term', 'Third Term'];
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
type Ctx = { actorId: string; ip?: string };

export async function assertRole(db: Queryable, userId: string, role: Role) {
  const { rows } = await db.query('select role from users where id = $1', [userId]);
  if (!rows[0]) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (rows[0].role !== role) throw new AppError(400, `That user is not a ${role}`, 'WRONG_ROLE');
}

const notFound = (what: string) => new AppError(404, `${what} not found`, 'NOT_FOUND');

// ---------- sessions ----------
const sessionRow = (r: any) => ({ id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date, isCurrent: r.is_current });

export async function listSessions() {
  const { rows } = await query('select * from academic_sessions order by start_date desc');
  return rows.map(sessionRow);
}

export async function createSession(i: { name: string; startDate: string; endDate: string }, ctx: Ctx) {
  const { rows } = await query(
    'insert into academic_sessions (name, start_date, end_date) values ($1,$2,$3) returning *', [i.name, i.startDate, i.endDate]);
  await audit({ actorId: ctx.actorId, action: 'session.created', entityType: 'session', entityId: rows[0].id, metadata: { name: i.name }, ip: ctx.ip });
  return sessionRow(rows[0]);
}

export async function updateSession(id: string, i: { name?: string; startDate?: string; endDate?: string }, ctx: Ctx) {
  const { rows } = await query(
    `update academic_sessions set name = coalesce($2, name), start_date = coalesce($3, start_date), end_date = coalesce($4, end_date)
      where id = $1 returning *`, [id, i.name ?? null, i.startDate ?? null, i.endDate ?? null]);
  if (!rows[0]) throw notFound('Session');
  if (rows[0].end_date < rows[0].start_date) throw new AppError(400, 'The end date cannot be before the start date', 'VALIDATION_ERROR');
  await audit({ actorId: ctx.actorId, action: 'session.updated', entityType: 'session', entityId: id, ip: ctx.ip });
  return sessionRow(rows[0]);
}

export async function setCurrentSession(id: string, ctx: Ctx) {
  return withTransaction(async (c) => {
    await c.query('update terms set is_current = false where is_current and session_id <> $1', [id]);
    await c.query('update academic_sessions set is_current = false where is_current and id <> $1', [id]);
    const { rows } = await c.query('update academic_sessions set is_current = true where id = $1 returning *', [id]);
    if (!rows[0]) throw notFound('Session');
    await audit({ actorId: ctx.actorId, action: 'session.set_current', entityType: 'session', entityId: id, ip: ctx.ip }, c);
    return sessionRow(rows[0]);
  });
}

// ---------- terms ----------
const termRow = (r: any) => ({
  id: r.id, sessionId: r.session_id, termNumber: r.term_number, name: TERM_NAMES[r.term_number - 1],
  startDate: r.start_date, endDate: r.end_date, isCurrent: r.is_current,
});

export async function listTerms(sessionId?: string) {
  const { rows } = await query('select * from terms where ($1::uuid is null or session_id = $1) order by start_date', [sessionId ?? null]);
  return rows.map(termRow);
}

export async function createTerm(i: { sessionId: string; termNumber: number; startDate: string; endDate: string }, ctx: Ctx) {
  const { rows } = await query(
    'insert into terms (session_id, term_number, start_date, end_date) values ($1,$2,$3,$4) returning *',
    [i.sessionId, i.termNumber, i.startDate, i.endDate]);
  await audit({ actorId: ctx.actorId, action: 'term.created', entityType: 'term', entityId: rows[0].id, ip: ctx.ip });
  return termRow(rows[0]);
}

export async function updateTerm(id: string, i: { startDate?: string; endDate?: string }, ctx: Ctx) {
  const { rows } = await query(
    'update terms set start_date = coalesce($2, start_date), end_date = coalesce($3, end_date) where id = $1 returning *',
    [id, i.startDate ?? null, i.endDate ?? null]);
  if (!rows[0]) throw notFound('Term');
  if (rows[0].end_date < rows[0].start_date) throw new AppError(400, 'The end date cannot be before the start date', 'VALIDATION_ERROR');
  await audit({ actorId: ctx.actorId, action: 'term.updated', entityType: 'term', entityId: id, ip: ctx.ip });
  return termRow(rows[0]);
}

// Making a term current also makes its session current, so the two can never disagree.
export async function setCurrentTerm(id: string, ctx: Ctx) {
  return withTransaction(async (c) => {
    const t = (await c.query('select session_id from terms where id = $1', [id])).rows[0];
    if (!t) throw notFound('Term');
    await c.query('update terms set is_current = false where is_current and id <> $1', [id]);
    await c.query('update academic_sessions set is_current = false where is_current and id <> $1', [t.session_id]);
    await c.query('update academic_sessions set is_current = true where id = $1', [t.session_id]);
    const { rows } = await c.query('update terms set is_current = true where id = $1 returning *', [id]);
    await audit({ actorId: ctx.actorId, action: 'term.set_current', entityType: 'term', entityId: id, ip: ctx.ip }, c);
    return termRow(rows[0]);
  });
}

// ---------- classes ----------
const classRow = (r: any) => ({ id: r.id, stage: r.stage, year: r.year, arm: r.arm, name: r.name });

export async function listClasses() {
  const { rows } = await query(`select c.*, ${CLASS_NAME} as name from classes c order by c.stage desc, c.year, c.arm nulls first`);
  return rows.map(classRow);
}

export async function createClass(i: { stage: string; year: number; arm?: string | null }, ctx: Ctx) {
  const { rows } = await query(
    `insert into classes (stage, year, arm) values ($1,$2,$3)
     returning *, stage || ' ' || year || coalesce(arm, '') as name`, [i.stage, i.year, i.arm || null]);
  await audit({ actorId: ctx.actorId, action: 'class.created', entityType: 'class', entityId: rows[0].id, metadata: { name: rows[0].name }, ip: ctx.ip });
  return classRow(rows[0]);
}

export async function updateClass(id: string, i: { arm?: string | null }, ctx: Ctx) {
  const { rows } = await query(
    `update classes set arm = $2 where id = $1 returning *, stage || ' ' || year || coalesce(arm, '') as name`, [id, i.arm || null]);
  if (!rows[0]) throw notFound('Class');
  await audit({ actorId: ctx.actorId, action: 'class.updated', entityType: 'class', entityId: id, ip: ctx.ip });
  return classRow(rows[0]);
}

// ---------- subjects ----------
const subjectRow = (r: any) => ({ id: r.id, name: r.name, code: r.code });

export async function listSubjects() {
  const { rows } = await query('select * from subjects order by name');
  return rows.map(subjectRow);
}
export async function createSubject(i: { name: string; code?: string }, ctx: Ctx) {
  const { rows } = await query('insert into subjects (name, code) values ($1,$2) returning *', [i.name, i.code ?? null]);
  await audit({ actorId: ctx.actorId, action: 'subject.created', entityType: 'subject', entityId: rows[0].id, ip: ctx.ip });
  return subjectRow(rows[0]);
}
export async function updateSubject(id: string, i: { name?: string; code?: string }, ctx: Ctx) {
  const { rows } = await query('update subjects set name = coalesce($2, name), code = coalesce($3, code) where id = $1 returning *', [id, i.name ?? null, i.code ?? null]);
  if (!rows[0]) throw notFound('Subject');
  await audit({ actorId: ctx.actorId, action: 'subject.updated', entityType: 'subject', entityId: id, ip: ctx.ip });
  return subjectRow(rows[0]);
}

export async function getClassSubjects(classId: string) {
  const { rows } = await query(
    'select s.* from class_subjects cs join subjects s on s.id = cs.subject_id where cs.class_id = $1 order by s.name', [classId]);
  return rows.map(subjectRow);
}

export async function setClassSubjects(classId: string, subjectIds: string[], ctx: Ctx) {
  await withTransaction(async (c) => {
    if (!(await c.query('select 1 from classes where id = $1', [classId])).rowCount) throw notFound('Class');
    const ids = [...new Set(subjectIds)];
    const removed = await c.query(
      'select subject_id from class_subjects where class_id = $1 and not (subject_id = any($2::uuid[]))', [classId, ids]);
    if (removed.rowCount) {
      const used = await c.query(
        'select 1 from teaching_assignments where class_id = $1 and subject_id = any($2::uuid[]) limit 1',
        [classId, removed.rows.map((r) => r.subject_id)]);
      if (used.rowCount) throw new AppError(409, 'A subject you removed still has a teacher assigned. Remove the teacher assignment first.', 'IN_USE');
      await c.query('delete from class_subjects where class_id = $1 and subject_id = any($2::uuid[])', [classId, removed.rows.map((r) => r.subject_id)]);
    }
    await c.query(
      'insert into class_subjects (class_id, subject_id) select $1, unnest($2::uuid[]) on conflict do nothing', [classId, ids]);
    await audit({ actorId: ctx.actorId, action: 'class.subjects_set', entityType: 'class', entityId: classId, metadata: { count: ids.length }, ip: ctx.ip }, c);
  });
  return getClassSubjects(classId);
}

// ---------- teaching assignments ----------
const assignmentSql = `
  select ta.id, ta.session_id, ta.class_id, ta.subject_id, ta.teacher_id,
         ${CLASS_NAME} as class_name, s.name as subject_name, u.first_name, u.last_name, tp.staff_number
    from teaching_assignments ta
    join classes c on c.id = ta.class_id join subjects s on s.id = ta.subject_id
    join users u on u.id = ta.teacher_id left join teacher_profiles tp on tp.user_id = u.id`;
const assignmentRow = (r: any) => ({
  id: r.id, sessionId: r.session_id, classId: r.class_id, className: r.class_name, subjectId: r.subject_id,
  subjectName: r.subject_name, teacherId: r.teacher_id, teacherName: `${r.first_name} ${r.last_name}`, staffNumber: r.staff_number,
});

export async function listAssignments(f: { sessionId?: string; classId?: string; teacherId?: string }) {
  const { rows } = await query(
    `${assignmentSql} where ($1::uuid is null or ta.session_id = $1) and ($2::uuid is null or ta.class_id = $2)
       and ($3::uuid is null or ta.teacher_id = $3) order by class_name, subject_name`,
    [f.sessionId ?? null, f.classId ?? null, f.teacherId ?? null]);
  return rows.map(assignmentRow);
}

export async function createAssignment(i: { sessionId: string; classId: string; subjectId: string; teacherId: string }, ctx: Ctx) {
  const id = await withTransaction(async (c) => {
    await assertRole(c, i.teacherId, 'teacher');
    const ins = await c.query(
      'insert into teaching_assignments (session_id, class_id, subject_id, teacher_id) values ($1,$2,$3,$4) returning id',
      [i.sessionId, i.classId, i.subjectId, i.teacherId]);
    await audit({ actorId: ctx.actorId, action: 'assignment.created', entityType: 'teaching_assignment', entityId: ins.rows[0].id, metadata: i, ip: ctx.ip }, c);
    return ins.rows[0].id as string;
  });
  return assignmentRow((await query(`${assignmentSql} where ta.id = $1`, [id])).rows[0]);
}

export async function deleteAssignment(id: string, ctx: Ctx) {
  const { rowCount } = await query('delete from teaching_assignments where id = $1', [id]);
  if (!rowCount) throw notFound('Assignment');
  await audit({ actorId: ctx.actorId, action: 'assignment.deleted', entityType: 'teaching_assignment', entityId: id, ip: ctx.ip });
}

// ---------- enrolments ----------
export async function enrol(i: { studentId: string; classId: string; sessionId: string }, ctx: Ctx) {
  return withTransaction(async (c) => {
    await assertRole(c, i.studentId, 'student');
    // One class per student per session: enrolling again moves the student.
    const { rows } = await c.query(
      `insert into enrolments (student_id, class_id, session_id) values ($1,$2,$3)
       on conflict (student_id, session_id) do update set class_id = excluded.class_id, status = 'active'
       returning id, student_id, class_id, session_id, status`, [i.studentId, i.classId, i.sessionId]);
    await audit({ actorId: ctx.actorId, action: 'enrolment.set', entityType: 'enrolment', entityId: rows[0].id, metadata: i, ip: ctx.ip }, c);
    return { id: rows[0].id, studentId: rows[0].student_id, classId: rows[0].class_id, sessionId: rows[0].session_id, status: rows[0].status };
  });
}

export async function setEnrolmentStatus(id: string, status: string, ctx: Ctx) {
  const { rowCount } = await query('update enrolments set status = $2 where id = $1', [id, status]);
  if (!rowCount) throw notFound('Enrolment');
  await audit({ actorId: ctx.actorId, action: 'enrolment.status', entityType: 'enrolment', entityId: id, metadata: { status }, ip: ctx.ip });
}

export async function listEnrolments(f: { sessionId?: string; classId?: string }) {
  const { rows } = await query(
    `select e.id, e.status, e.student_id, e.class_id, e.session_id, ${CLASS_NAME} as class_name,
            u.first_name, u.last_name, sp.admission_number
       from enrolments e join classes c on c.id = e.class_id join users u on u.id = e.student_id
       left join student_profiles sp on sp.user_id = u.id
      where ($1::uuid is null or e.session_id = $1) and ($2::uuid is null or e.class_id = $2)
      order by u.last_name, u.first_name`, [f.sessionId ?? null, f.classId ?? null]);
  return rows.map((r) => ({
    id: r.id, status: r.status, studentId: r.student_id, studentName: `${r.first_name} ${r.last_name}`,
    admissionNumber: r.admission_number, classId: r.class_id, className: r.class_name, sessionId: r.session_id,
  }));
}
