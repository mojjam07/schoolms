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
