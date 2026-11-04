import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './notifications.service';

const h = (fn: (req: any) => Promise<unknown>): RequestHandler => async (req, res) => { ok(res, await fn(req)); };
const listQuery = z.object({
  unread: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
const idParam = z.object({ id: z.string().uuid() });

const r = Router();
r.use(authenticate); // every route below is scoped to the signed-in user only
r.get('/', validate({ query: listQuery }), h((q) => s.listNotifications(q.user.id, { unreadOnly: q.validated.query.unread, page: q.validated.query.page, pageSize: q.validated.query.pageSize })));
r.get('/unread-count', h(async (q) => ({ count: await s.unreadCount(q.user.id) })));
r.post('/read-all', h((q) => s.markAllRead(q.user.id)));
r.post('/:id/read', validate({ params: idParam }), h((q) => s.markRead(q.user.id, q.validated.params.id)));
export default r;
