import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { createLink, deleteLink } from '../people/people.service';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
type Rel = 'mother' | 'father' | 'guardian' | 'other';

// ---- A parent's own account page ----
export async function myFamily(parentId: string) {
  const [u, kids, reqs] = await Promise.all([
    query('select u.email, u.first_name, u.last_name, u.phone, p.address from users u left join parent_profiles p on p.user_id = u.id where u.id = $1', [parentId]),
    query(`select s.id, s.first_name, s.last_name, ps.relationship, ps.is_primary, ${CLASS_NAME} as class_name
             from parent_students ps join users s on s.id = ps.student_id
             left join academic_sessions ses on ses.is_current
             left join enrolments e on e.student_id = s.id and e.session_id = ses.id and e.status = 'active'
             left join classes c on c.id = e.class_id
            where ps.parent_id = $1 order by s.first_name`, [parentId]),
    query(`select r.*, s.first_name sf, s.last_name sl from guardian_change_requests r left join users s on s.id = r.student_id where r.parent_id = $1 order by r.created_at desc limit 30`, [parentId]),
  ]);
  const a = u.rows[0];
  return {
    contact: { firstName: a.first_name, lastName: a.last_name, email: a.email, phone: a.phone, address: a.address ?? null },
    children: kids.rows.map((k) => ({ studentId: k.id, name: `${k.first_name} ${k.last_name}`, relationship: k.relationship, isPrimary: k.is_primary, className: k.class_name })),
    requests: reqs.rows.map(shapeRequest),
  };
}
const shapeRequest = (r: any) => ({
  id: r.id, kind: r.kind, status: r.status, studentId: r.student_id, studentName: r.sf ? `${r.sf} ${r.sl}` : null, proposedRelationship: r.proposed_relationship,
  childName: r.child_name, admissionNumber: r.admission_number, note: r.note, decisionNote: r.decision_note, createdAt: r.created_at, decidedAt: r.decided_at,
});

// Phone and address only. A change of email address goes through the school, because it is how the person signs in and is verified.
export async function updateContact(parentId: string, i: { phone?: string | null; address?: string | null }, ip?: string) {
  await withTransaction(async (c) => {
    if (i.phone !== undefined) await c.query('update users set phone = $2, updated_at = now() where id = $1', [parentId, i.phone || null]);
    if (i.address !== undefined) await c.query(`insert into parent_profiles (user_id, address) values ($1,$2) on conflict (user_id) do update set address = excluded.address`, [parentId, i.address || null]);
    await audit({ actorId: parentId, action: 'family.contact_updated', entityType: 'user', entityId: parentId, metadata: { fields: Object.keys(i) }, ip }, c);
  });
  return { saved: true };
}

// ---- Requests to correct guardian links ----
export async function createRequest(parentId: string, i: { kind: 'relationship' | 'remove' | 'add'; studentId?: string; proposedRelationship?: Rel; childName?: string; admissionNumber?: string; note: string }, ip?: string) {
  if (i.kind === 'add') {
    if (!i.childName && !i.admissionNumber) throw new AppError(400, 'Give the child’s name or admission number.', 'VALIDATION_ERROR');
  } else {
    if (!i.studentId) throw new AppError(400, 'Choose the child this is about.', 'VALIDATION_ERROR');
    const linked = (await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [parentId, i.studentId])).rowCount;
    if (!linked) throw new AppError(403, 'That child is not linked to your account.', 'FORBIDDEN');
  }
  if (i.kind === 'relationship' && !i.proposedRelationship) throw new AppError(400, 'Choose the correct relationship.', 'VALIDATION_ERROR');
  try {
    const r = await query(
      `insert into guardian_change_requests (parent_id, kind, student_id, proposed_relationship, child_name, admission_number, note) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [parentId, i.kind, i.kind === 'add' ? null : i.studentId, i.proposedRelationship ?? null, i.childName ?? null, i.admissionNumber ?? null, i.note]);
    const admins = (await query("select id from users where role = 'admin' and status = 'active'")).rows;
    for (const a of admins) await query(`insert into notifications (user_id, type, title, body, link, entity_type, entity_id) values ($1,'family_request','A parent sent a guardian correction request',$2,'/admin/family-requests','guardian_change_request',$3)`, [a.id, i.note.slice(0, 140), r.rows[0].id]);
    await audit({ actorId: parentId, action: 'family.request_created', entityType: 'guardian_change_request', entityId: r.rows[0].id, metadata: { kind: i.kind }, ip });
    return { id: r.rows[0].id as string };
  } catch (e: any) {
    if (e.code === '23505') throw new AppError(409, 'You already have an open request about this child. Please wait for the school to reply.', 'DUPLICATE');
    throw e;
  }
}

export async function cancelRequest(parentId: string, id: string, ip?: string) {
  const { rowCount } = await query(`update guardian_change_requests set status = 'cancelled', decided_at = now() where id = $1 and parent_id = $2 and status = 'pending'`, [id, parentId]);
  if (!rowCount) throw new AppError(404, 'Request not found or already answered', 'NOT_FOUND');
  await audit({ actorId: parentId, action: 'family.request_cancelled', entityType: 'guardian_change_request', entityId: id, ip });
  return { cancelled: true };
}

// ---- Administrator review ----
export async function adminList(f: { status?: string; page: number; pageSize: number }) {
  const total = (await query('select count(*)::int n from guardian_change_requests where ($1::text is null or status = $1)', [f.status ?? null])).rows[0].n as number;
  const { rows } = await query(
    `select r.*, s.first_name sf, s.last_name sl, p.first_name pf, p.last_name pl, p.email as parent_email,
            (select ps.relationship from parent_students ps where ps.parent_id = r.parent_id and ps.student_id = r.student_id) as current_relationship
       from guardian_change_requests r join users p on p.id = r.parent_id left join users s on s.id = r.student_id
      where ($1::text is null or r.status = $1)
      order by (r.status = 'pending') desc, r.created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, [f.status ?? null]);
  return { items: rows.map((r) => ({ ...shapeRequest(r), parentId: r.parent_id, parentName: `${r.pf} ${r.pl}`, parentEmail: r.parent_email, currentRelationship: r.current_relationship })), page: f.page, pageSize: f.pageSize, total };
}

export async function decide(adminId: string, id: string, i: { decision: 'approve' | 'decline'; note?: string; studentId?: string }, ip?: string) {
  const r = (await query('select * from guardian_change_requests where id = $1', [id])).rows[0];
  if (!r) throw new AppError(404, 'Request not found', 'NOT_FOUND');
  if (r.status !== 'pending') throw new AppError(409, 'This request has already been answered.', 'ALREADY_DECIDED');
  if (i.decision === 'approve') {
    // The school verifies before applying. Each change goes through the same audited routines the administrator screens use.
    if (r.kind === 'relationship') {
      const { rowCount } = await query('update parent_students set relationship = $3 where parent_id = $1 and student_id = $2', [r.parent_id, r.student_id, r.proposed_relationship]);
      if (!rowCount) throw new AppError(409, 'The guardian link no longer exists.', 'CONFLICT');
      await audit({ actorId: adminId, action: 'guardian_link.set', entityType: 'student', entityId: r.student_id, metadata: { parentId: r.parent_id, relationship: r.proposed_relationship, viaRequest: id }, ip });
    } else if (r.kind === 'remove') {
      await deleteLink(r.parent_id, r.student_id, adminId, ip);
    } else {
      let studentId = i.studentId;
      if (!studentId && r.admission_number) studentId = (await query('select user_id from student_profiles where admission_number = $1', [r.admission_number])).rows[0]?.user_id;
      if (!studentId) throw new AppError(400, 'Choose which student to link (the request did not give a matching admission number).', 'VALIDATION_ERROR');
      if ((await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [r.parent_id, studentId])).rowCount) throw new AppError(409, 'This parent is already linked to that student.', 'CONFLICT');
      await createLink({ parentId: r.parent_id, studentId, relationship: r.proposed_relationship ?? 'guardian', isPrimary: false }, adminId, ip);
    }
  }
  await query(`update guardian_change_requests set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1`, [id, i.decision === 'approve' ? 'approved' : 'declined', adminId, i.note ?? null]);
  await audit({ actorId: adminId, action: `family.request_${i.decision === 'approve' ? 'approved' : 'declined'}`, entityType: 'guardian_change_request', entityId: id, ip });
  await query(`insert into notifications (user_id, type, title, body, link, entity_type, entity_id) values ($1,'family_request',$2,$3,'/parent/account','guardian_change_request',$4)`,
    [r.parent_id, i.decision === 'approve' ? 'Your request was approved' : 'Your request was not approved', (i.note ?? '').slice(0, 140), id]);
  return { status: i.decision === 'approve' ? 'approved' : 'declined' };
}
