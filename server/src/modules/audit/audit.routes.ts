import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import { query } from '../../db/pool';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const listQuery = z.object({
  q: z.string().trim().max(100).optional(), action: z.string().trim().max(80).optional(), actorId: z.string().uuid().optional(),
  from: day.optional(), to: day.optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const h = (fn: (req: any) => Promise<unknown>): RequestHandler => async (req, res) => { ok(res, await fn(req)); };
const r = Router();
r.use(authenticate, requireRole('admin'));

// Read only: the log is written by the app and nothing here can change or delete it. Times are Lagos days.
r.get('/', validate({ query: listQuery }), h(async (q) => {
  const f = q.validated.query;
  const params = [f.action ?? null, f.actorId ?? null, f.from ?? null, f.to ?? null, f.q ? `%${f.q}%` : null];
  const where = `($1::text is null or a.action = $1) and ($2::uuid is null or a.actor_id = $2)
    and ($3::date is null or (a.created_at at time zone 'Africa/Lagos')::date >= $3) and ($4::date is null or (a.created_at at time zone 'Africa/Lagos')::date <= $4)
    and ($5::text is null or a.action ilike $5 or a.entity_id ilike $5 or a.metadata::text ilike $5 or u.first_name || ' ' || u.last_name ilike $5 or u.email ilike $5)`;
  const from = `from audit_logs a left join users u on u.id = a.actor_id where ${where}`;
  const total = (await query(`select count(*)::int as n ${from}`, params)).rows[0].n as number;
  const { rows } = await query(
    `select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.ip, a.created_at, u.first_name, u.last_name, u.email, a.actor_id
       ${from} order by a.id desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return {
    items: rows.map((x) => ({
      id: String(x.id), action: x.action, entityType: x.entity_type, entityId: x.entity_id, metadata: x.metadata, ip: x.ip, createdAt: x.created_at,
      actorId: x.actor_id, actorName: x.first_name ? `${x.first_name} ${x.last_name}` : null, actorEmail: x.email,
    })),
    page: f.page, pageSize: f.pageSize, total,
  };
}));

r.get('/actions', h(async () => (await query('select distinct action from audit_logs order by action')).rows.map((x) => x.action as string)));
export default r;
