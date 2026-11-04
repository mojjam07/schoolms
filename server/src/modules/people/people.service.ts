import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { assertRole } from '../academic/academic.service';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;

// ---------- guardian links (admin only: official relationships need school verification) ----------
export async function createLink(
  i: { parentId: string; studentId: string; relationship: string; isPrimary: boolean }, actorId: string, ip?: string,
) {
  await withTransaction(async (c) => {
    await assertRole(c, i.parentId, 'parent');
    await assertRole(c, i.studentId, 'student');
    if (i.isPrimary) await c.query('update parent_students set is_primary = false where student_id = $1', [i.studentId]);
    await c.query(
      `insert into parent_students (parent_id, student_id, relationship, is_primary, created_by) values ($1,$2,$3,$4,$5)
       on conflict (parent_id, student_id) do update set relationship = excluded.relationship, is_primary = excluded.is_primary`,
      [i.parentId, i.studentId, i.relationship, i.isPrimary, actorId]);
    await audit({ actorId, action: 'guardian_link.set', entityType: 'student', entityId: i.studentId, metadata: i, ip }, c);
  });
  return { linked: true };
}

export async function deleteLink(parentId: string, studentId: string, actorId: string, ip?: string) {
  const { rowCount } = await query('delete from parent_students where parent_id = $1 and student_id = $2', [parentId, studentId]);
  if (!rowCount) throw new AppError(404, 'Link not found', 'NOT_FOUND');
  await audit({ actorId, action: 'guardian_link.removed', entityType: 'student', entityId: studentId, metadata: { parentId }, ip });
}

export async function listLinks(f: { parentId?: string; studentId?: string }) {
  const { rows } = await query(
    `select ps.*, p.first_name as pf, p.last_name as pl, p.email as parent_email, s.first_name as sf, s.last_name as sl
       from parent_students ps join users p on p.id = ps.parent_id join users s on s.id = ps.student_id
      where ($1::uuid is null or ps.parent_id = $1) and ($2::uuid is null or ps.student_id = $2)
      order by s.last_name, s.first_name`, [f.parentId ?? null, f.studentId ?? null]);
  return rows.map((r) => ({
    parentId: r.parent_id, parentName: `${r.pf} ${r.pl}`, parentEmail: r.parent_email,
    studentId: r.student_id, studentName: `${r.sf} ${r.sl}`, relationship: r.relationship, isPrimary: r.is_primary,
  }));
}

// ---------- student directory (admin) ----------
export async function listStudents(f: { q?: string; classId?: string; sessionId?: string; page: number; pageSize: number }) {
  const params = [f.sessionId ?? null, f.classId ?? null, f.q ? `%${f.q}%` : null];
  const from = `
    from users u join student_profiles sp on sp.user_id = u.id
    left join academic_sessions s on (($1::uuid is null and s.is_current) or s.id = $1)
    left join enrolments e on e.student_id = u.id and e.session_id = s.id
    left join classes c on c.id = e.class_id
    where u.role = 'student' and ($2::uuid is null or e.class_id = $2)
      and ($3::text is null or u.first_name || ' ' || u.last_name ilike $3 or sp.admission_number ilike $3 or u.email ilike $3)`;
  const total = (await query(`select count(*)::int as n ${from}`, params)).rows[0].n as number;
  const { rows } = await query(
    `select u.id, u.first_name, u.last_name, u.email, u.status, sp.admission_number, e.status as enrolment_status,
            e.class_id, ${CLASS_NAME} as class_name ${from}
      order by u.last_name, u.first_name limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return {
    items: rows.map((r) => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, accountStatus: r.status,
      admissionNumber: r.admission_number, classId: r.class_id, className: r.class_name, enrolmentStatus: r.enrolment_status,
    })),
    page: f.page, pageSize: f.pageSize, total,
  };
}

// ---------- "me" endpoints: object-level access, always scoped to the caller ----------
export async function childrenOfParent(parentId: string) {
  const { rows } = await query(
    `select u.id, u.first_name, u.last_name, sp.admission_number, ps.relationship, ps.is_primary, ${CLASS_NAME} as class_name
       from parent_students ps join users u on u.id = ps.student_id
       left join student_profiles sp on sp.user_id = u.id
       left join academic_sessions s on s.is_current
       left join enrolments e on e.student_id = u.id and e.session_id = s.id and e.status = 'active'
       left join classes c on c.id = e.class_id
      where ps.parent_id = $1 order by u.first_name`, [parentId]);
  return rows.map((r) => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, admissionNumber: r.admission_number,
    relationship: r.relationship, isPrimary: r.is_primary, className: r.class_name,
  }));
}

export async function assignmentsOfTeacher(teacherId: string) {
  const { rows } = await query(
    `select ta.id, ta.class_id, ta.subject_id, ${CLASS_NAME} as class_name, sb.name as subject_name
       from teaching_assignments ta join academic_sessions s on s.id = ta.session_id and s.is_current
       join classes c on c.id = ta.class_id join subjects sb on sb.id = ta.subject_id
      where ta.teacher_id = $1 order by class_name, subject_name`, [teacherId]);
  return rows.map((r) => ({ id: r.id, classId: r.class_id, className: r.class_name, subjectId: r.subject_id, subjectName: r.subject_name }));
}

export async function myClassAndSubjects(studentId: string) {
  const { rows } = await query(
    `select c.id as class_id, ${CLASS_NAME} as class_name, s.name as session_name
       from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
       join classes c on c.id = e.class_id
      where e.student_id = $1 and e.status = 'active'`, [studentId]);
  if (!rows[0]) return { className: null, sessionName: null, subjects: [] };
  const subs = await query(
    'select sb.id, sb.name from class_subjects cs join subjects sb on sb.id = cs.subject_id where cs.class_id = $1 order by sb.name',
    [rows[0].class_id]);
  return { className: rows[0].class_name, sessionName: rows[0].session_name, subjects: subs.rows };
}
