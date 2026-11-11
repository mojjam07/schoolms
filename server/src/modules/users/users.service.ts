import { pool, query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { sendMail } from '../../services/mailer';
import { activationLink, createOneTimeToken } from '../auth/auth.service';
import type { Role } from './roles';

const activationMail = (user: any, link: string) => ({
  to: user.email,
  subject: 'Activate your Kingdom of Knowledge account',
  text: `Hello ${user.first_name},\n\nAn account has been created for you. Set your password within 72 hours:\n${link}`,
});

export async function resendActivation(id: string, actorId: string, ip?: string) {
  const { rows } = await query("select * from users where id = $1 and status = 'pending'", [id]);
  if (!rows[0]) throw new AppError(404, 'No pending account found. Only accounts that have not been activated can be resent.', 'NOT_FOUND');
  const link = activationLink(await createOneTimeToken(pool, id, 'activation', 72));
  await audit({ actorId, action: 'user.activation_resent', entityType: 'user', entityId: id, ip });
  const mail = await sendMail(activationMail(rows[0], link));
  return { activationLink: link, emailAccepted: mail.accepted };
}

const row = (u: any) => ({
  id: u.id, email: u.email, role: u.role, status: u.status, firstName: u.first_name,
  lastName: u.last_name, phone: u.phone, lastLoginAt: u.last_login_at, createdAt: u.created_at,
});

export async function createUser(
  input: { email: string; role: Role; firstName: string; lastName: string; phone?: string; admissionNumber?: string; staffNumber?: string },
  actorId: string | null, ip?: string,
) {
  const { user, token } = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `insert into users (email, role, first_name, last_name, phone) values ($1,$2,$3,$4,$5) returning *`,
      [input.email, input.role, input.firstName, input.lastName, input.phone ?? null]);
    const id = rows[0].id;
    if (input.role === 'student') await c.query('insert into student_profiles (user_id, admission_number) values ($1,$2)', [id, input.admissionNumber]);
    if (input.role === 'teacher') await c.query('insert into teacher_profiles (user_id, staff_number) values ($1,$2)', [id, input.staffNumber]);
    if (input.role === 'parent') await c.query('insert into parent_profiles (user_id) values ($1)', [id]);
    const token = await createOneTimeToken(c, rows[0].id, 'activation', 72);
    await audit({ actorId, action: 'user.created', entityType: 'user', entityId: rows[0].id, metadata: { role: input.role }, ip }, c);
    return { user: rows[0], token };
  });

  const link = activationLink(token);
  const mail = await sendMail(activationMail(user, link));
  return { user: row(user), activationLink: link, emailAccepted: mail.accepted };
}

export async function listUsers(f: { role?: Role; status?: string; q?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.role) add('role = ?', f.role);
  if (f.status) add('status = ?', f.status);
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(email ilike $${params.length} or first_name || ' ' || last_name ilike $${params.length})`);
  }
  const clause = where.length ? `where ${where.join(' and ')}` : '';

  const total = (await query(`select count(*)::int as n from users ${clause}`, params)).rows[0].n as number;
  const { rows } = await query(
    `select * from users ${clause} order by created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return { items: rows.map(row), page: f.page, pageSize: f.pageSize, total };
}

export async function setStatus(id: string, status: 'active' | 'suspended', actorId: string, ip?: string) {
  if (id === actorId) throw new AppError(400, 'You cannot change your own account status', 'INVALID_OPERATION');
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      `update users set status = $2, updated_at = now() where id = $1 and status <> 'pending' returning *`, [id, status]);
    if (!rows[0]) throw new AppError(404, 'User not found, or the account has not been activated yet', 'NOT_FOUND');
    if (status === 'suspended') {
      await c.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
    }
    await audit({ actorId, action: `user.${status === 'active' ? 'reactivated' : 'suspended'}`, entityType: 'user', entityId: id, ip }, c);
    return row(rows[0]);
  });
}

// ---------- viewing and editing a person ----------
export async function getUserDetail(id: string) {
  const u = (await query(
    `select u.*, sp.admission_number, sp.date_of_birth, tp.staff_number from users u
       left join student_profiles sp on sp.user_id = u.id left join teacher_profiles tp on tp.user_id = u.id where u.id = $1`, [id])).rows[0];
  if (!u) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return { ...row(u), admissionNumber: u.admission_number ?? null, dateOfBirth: u.date_of_birth ?? null, staffNumber: u.staff_number ?? null };
}

export interface UserPatch { firstName?: string; lastName?: string; phone?: string | null; email?: string; admissionNumber?: string; staffNumber?: string; dateOfBirth?: string | null }

export async function updateUser(id: string, p: UserPatch, actorId: string, ip?: string) {
  const dup = (e: any): never => {
    if (e?.code === '23505') {
      const c = String(e.constraint ?? '');
      if (c.includes('admission')) throw new AppError(409, 'That admission number belongs to another student.', 'DUPLICATE', [{ field: 'admissionNumber', message: 'Already used' }]);
      if (c.includes('staff')) throw new AppError(409, 'That staff number belongs to another teacher.', 'DUPLICATE', [{ field: 'staffNumber', message: 'Already used' }]);
      throw new AppError(409, 'That email address belongs to another account.', 'DUPLICATE', [{ field: 'email', message: 'Already used' }]);
    }
    throw e;
  };
  const result = await withTransaction(async (c) => {
    const cur = (await c.query('select * from users where id = $1 for update', [id])).rows[0];
    if (!cur) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (p.admissionNumber !== undefined && cur.role !== 'student') throw new AppError(400, 'Only students have an admission number.', 'VALIDATION_ERROR');
    if (p.dateOfBirth !== undefined && cur.role !== 'student') throw new AppError(400, 'Only students have a date of birth recorded.', 'VALIDATION_ERROR');
    if (p.staffNumber !== undefined && cur.role !== 'teacher') throw new AppError(400, 'Only teachers have a staff number.', 'VALIDATION_ERROR');
    const emailChanged = p.email !== undefined && p.email.toLowerCase() !== String(cur.email).toLowerCase();
    await c.query(
      `update users set first_name = coalesce($2, first_name), last_name = coalesce($3, last_name), phone = case when $4 then $5 else phone end,
              email = coalesce($6, email), updated_at = now() where id = $1`,
      [id, p.firstName ?? null, p.lastName ?? null, p.phone !== undefined, p.phone ? p.phone : null, p.email ?? null]).catch(dup);
    const changes: Record<string, unknown> = {};
    for (const k of ['firstName', 'lastName', 'phone', 'dateOfBirth'] as const) if (p[k] !== undefined) changes[k] = 'changed';
    if (emailChanged) changes.email = { from: cur.email, to: p.email };
    if (p.admissionNumber !== undefined) {
      const old = (await c.query('select admission_number from student_profiles where user_id = $1', [id])).rows[0]?.admission_number;
      await c.query('update student_profiles set admission_number = $2 where user_id = $1', [id, p.admissionNumber]).catch(dup);
      if (old !== p.admissionNumber) changes.admissionNumber = { from: old, to: p.admissionNumber };
    }
    if (p.dateOfBirth !== undefined) await c.query('update student_profiles set date_of_birth = $2 where user_id = $1', [id, p.dateOfBirth]);
    if (p.staffNumber !== undefined) {
      const old = (await c.query('select staff_number from teacher_profiles where user_id = $1', [id])).rows[0]?.staff_number;
      await c.query('update teacher_profiles set staff_number = $2 where user_id = $1', [id, p.staffNumber]).catch(dup);
      if (old !== p.staffNumber) changes.staffNumber = { from: old, to: p.staffNumber };
    }
    // Signing in uses the email, so every signed-in device is signed out when it changes.
    if (emailChanged) await c.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
    await audit({ actorId, action: 'user.updated', entityType: 'user', entityId: id, metadata: changes, ip }, c);
    return { emailChanged, pending: cur.status === 'pending' };
  });
  // An account that was never activated has an activation link sent to the old address, so send a fresh one to the new address.
  let activation: { emailAccepted: boolean; activationLink?: string } | undefined;
  if (result.emailChanged && result.pending) { const r = await resendActivation(id, actorId, ip); activation = { emailAccepted: r.emailAccepted, activationLink: r.activationLink }; }
  return { user: await getUserDetail(id), activation };
}
