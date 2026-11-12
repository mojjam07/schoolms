import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as f from './family.service';
import * as p from './preferences.service';

const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const id = z.object({ id: z.string().uuid() });
const rel = z.enum(['mother', 'father', 'guardian', 'other']);
const r = Router();

// Parent's own account (always scoped to the caller)
const parent = [authenticate, requireRole('parent')];
r.get('/me', ...parent, h((q) => f.myFamily(q.user.id)));
r.patch('/me/contact', ...parent, validate({ body: z.object({
  phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces, + and - only').nullish().transform((v) => v ?? undefined),
  address: z.string().trim().max(300).nullish().transform((v) => v ?? undefined) }).refine((b) => b.phone !== undefined || b.address !== undefined, 'Nothing to change') }), h((q) => f.updateContact(q.user.id, q.validated.body, q.ip)));
r.post('/me/requests', ...parent, validate({ body: z.object({
  kind: z.enum(['relationship', 'remove', 'add']), studentId: z.string().uuid().optional(), proposedRelationship: rel.optional(),
  childName: z.string().trim().max(120).optional(), admissionNumber: z.string().trim().max(40).optional(), note: z.string().trim().min(1, 'Please explain the correction').max(1000) }) }),
  h((q) => f.createRequest(q.user.id, q.validated.body, q.ip), 201));
r.post('/me/requests/:id/cancel', ...parent, validate({ params: id }), h((q) => f.cancelRequest(q.user.id, q.validated.params.id, q.ip)));

// Administrator review
const admin = [authenticate, requireRole('admin')];
r.get('/admin/requests', ...admin, validate({ query: z.object({ status: z.enum(['pending', 'approved', 'declined', 'cancelled']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }) }), h((q) => f.adminList(q.validated.query)));
r.post('/admin/requests/:id/decide', ...admin, validate({ params: id, body: z.object({ decision: z.enum(['approve', 'decline']), note: z.string().trim().max(500).optional(), studentId: z.string().uuid().optional() }) }), h((q) => f.decide(q.user.id, q.validated.params.id, q.validated.body, q.ip)));

// Notification preferences: every signed-in role
const anyone = [authenticate];
r.get('/preferences', ...anyone, h((q) => p.getPreferences(q.user.id)));
r.put('/preferences', ...anyone, validate({ body: z.object({ preferences: z.array(z.object({ category: z.enum(p.CATEGORIES.map((c) => c.key) as [p.Category, ...p.Category[]]), inApp: z.boolean(), email: z.boolean() })).min(1).max(20) }) }), h((q) => p.savePreferences(q.user.id, q.validated.body.preferences)));
export default r;
