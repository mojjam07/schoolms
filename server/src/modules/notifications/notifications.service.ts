import { pool, query, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';

export interface NewNotification {
  type: string; title: string; body?: string; link?: string;
  entityType?: string; entityId?: string; dedupeKey?: string; availableAt?: Date | string | null;
}

// Adds one in-app notification for each recipient. A repeated dedupeKey for the same person is silently skipped.
export async function notifyUsers(db: Queryable, userIds: string[], n: NewNotification) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const { rowCount } = await db.query(
    `insert into notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key, available_at)
     select u, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()) from unnest($1::uuid[]) as u
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
    [ids, n.type, n.title, n.body ?? '', n.link ?? null, n.entityType ?? null, n.entityId ?? null, n.dedupeKey ?? null, n.availableAt ?? null]);
  return rowCount ?? 0;
}

// Same as notifyUsers for one person, but returns the new notification's id (or null if it was a duplicate).
export async function notifyOne(db: Queryable, userId: string, n: NewNotification) {
  const { rows } = await db.query(
    `insert into notifications (user_id, type, title, body, link, entity_type, entity_id, dedupe_key, available_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`,
    [userId, n.type, n.title, n.body ?? '', n.link ?? null, n.entityType ?? null, n.entityId ?? null, n.dedupeKey ?? null, n.availableAt ?? null]);
  return (rows[0]?.id as string | undefined) ?? null;
}

// A failed notification must never undo or block the action that caused it.
export async function safely(label: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { console.error(`[notifications] ${label} failed:`, (e as Error).message); }
}

export async function studentsInClass(db: Queryable, classId: string, sessionId: string) {
  const { rows } = await db.query("select student_id from enrolments where class_id = $1 and session_id = $2 and status = 'active'", [classId, sessionId]);
  return rows.map((r) => r.student_id as string);
}

// Parents are only ever reached through the guardian links an administrator verified.
export async function parentsOfStudents(db: Queryable, studentIds: string[]) {
  if (!studentIds.length) return [];
  const { rows } = await db.query('select distinct parent_id from parent_students where student_id = any($1::uuid[])', [studentIds]);
  return rows.map((r) => r.parent_id as string);
}

// ---------- reading and clearing (always scoped to the signed-in user) ----------
const visibleNow = 'available_at <= now()';

export async function listNotifications(userId: string, f: { unreadOnly: boolean; page: number; pageSize: number }) {
  const where = `user_id = $1 and ${visibleNow} and ($2::boolean = false or read_at is null)`;
  const total = (await query(`select count(*)::int as n from notifications where ${where}`, [userId, f.unreadOnly])).rows[0].n as number;
  const { rows } = await query(
    `select id, type, title, body, link, read_at, available_at from notifications where ${where}
      order by available_at desc, id limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, [userId, f.unreadOnly]);
  return {
    items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, read: !!r.read_at, createdAt: r.available_at })),
    page: f.page, pageSize: f.pageSize, total, unreadCount: await unreadCount(userId),
  };
}

export async function unreadCount(userId: string) {
  return (await query(`select count(*)::int as n from notifications where user_id = $1 and read_at is null and ${visibleNow}`, [userId])).rows[0].n as number;
}

export async function markRead(userId: string, id: string) {
  const { rowCount } = await query('update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2', [id, userId]);
  if (!rowCount) throw new AppError(404, 'Notification not found', 'NOT_FOUND');
  return { unreadCount: await unreadCount(userId) };
}

export async function markAllRead(userId: string) {
  await query(`update notifications set read_at = now() where user_id = $1 and read_at is null and ${visibleNow}`, [userId]);
  return { unreadCount: 0 };
}

export { pool };
