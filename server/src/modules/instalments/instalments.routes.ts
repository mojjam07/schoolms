import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './instalments.service';

const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const inv = z.object({ invoiceId: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-01-31');

const r = Router();
const admin = [authenticate, requireRole('admin')];
r.get('/admin/invoice/:invoiceId', ...admin, validate({ params: inv }), h((q) => s.adminPlan(q.validated.params.invoiceId)));
r.get('/admin/invoice/:invoiceId/suggest', ...admin, validate({ params: inv, query: z.object({ count: z.coerce.number().int().min(2).max(6), firstDue: date, gapDays: z.coerce.number().int().min(7).max(120).default(30) }) }),
  h((q) => s.suggest(q.validated.params.invoiceId, q.validated.query.count, q.validated.query.firstDue, q.validated.query.gapDays)));
r.put('/admin/invoice/:invoiceId', ...admin, validate({ params: inv, body: z.object({ instalments: z.array(z.object({ dueDate: date, amountKobo: z.number().int().positive() })).min(2).max(6) }) }),
  h((q) => s.setPlan(q.validated.params.invoiceId, q.validated.body.instalments, q.user.id, q.ip)));
r.delete('/admin/invoice/:invoiceId', ...admin, validate({ params: inv }), h((q) => s.clearPlan(q.validated.params.invoiceId, q.user.id, q.ip)));
// A parent sees the plan only for an invoice of a child linked to them.
r.get('/parent/invoice/:invoiceId', authenticate, requireRole('parent'), validate({ params: inv }), h((q) => s.parentPlan(q.user.id, q.validated.params.invoiceId)));
export default r;
