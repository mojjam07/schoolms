import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './messages.service';

const actor = (req: any) => ({ id: req.user.id as string, role: req.user.role, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const id = z.object({ id: z.string().uuid() });
const body = z.string().trim().min(1, 'Write a message').max(4000, 'Keep messages under 4000 characters');
const paging = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) };

const r = Router();
const people = [authenticate, requireRole('parent', 'teacher', 'admin')];
const sides = [authenticate, requireRole('parent', 'teacher')];
const admin = [authenticate, requireRole('admin')];

r.get('/contacts', ...sides, h((q) => s.contacts(actor(q))));
r.get('/unread-count', ...people, h((q) => s.unreadCount(actor(q))));
r.get('/threads', ...people, validate({ query: z.object({ status: z.enum(['open', 'closed']).optional(), ...paging }) }), h((q) => s.listThreads(actor(q), q.validated.query)));
r.post('/threads', ...people, validate({ body: z.object({
  studentId: z.string().uuid(), recipientId: z.string().uuid().nullish(), parentId: z.string().uuid().optional(),
  subject: z.string().trim().min(1, 'Add a subject').max(150), body }) }), h((q) => s.startThread(actor(q), q.validated.body), 201));
r.get('/threads/:id', ...people, validate({ params: id }), h((q) => s.getThread(actor(q), q.validated.params.id)));
r.post('/threads/:id/messages', ...people, validate({ params: id, body: z.object({ body }) }), h((q) => s.reply(actor(q), q.validated.params.id, q.validated.body.body), 201));
r.patch('/threads/:id/status', ...people, validate({ params: id, body: z.object({ status: z.enum(['open', 'closed']) }) }), h((q) => s.setStatus(actor(q), q.validated.params.id, q.validated.body.status)));
r.post('/messages/:id/report', ...people, validate({ params: id, body: z.object({ reason: z.string().trim().min(3).max(500) }) }), h((q) => s.report(actor(q), q.validated.params.id, q.validated.body.reason)));

// Administrator oversight: every conversation, reported ones first on request. Each review is written to the audit log.
r.get('/admin/threads', ...admin, validate({ query: z.object({ reported: z.enum(['true', 'false']).optional().transform((v) => v === 'true'), q: z.string().trim().max(100).optional(), ...paging }) }), h((q) => s.adminList(q.validated.query)));
r.post('/admin/messages/:id/hide', ...admin, validate({ params: id, body: z.object({ hidden: z.boolean().default(true), reason: z.string().trim().max(300).optional() }) }), h((q) => s.hideMessage(actor(q), q.validated.params.id, q.validated.body.hidden, q.validated.body.reason)));
export default r;
