import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import * as s from './retention.service';

const r = Router();
r.use(authenticate, requireRole('admin'));

// What the cleanup would remove right now, and the rules it follows. Nothing is changed.
r.get('/retention', async (_req, res) => { ok(res, await s.preview()); });
// Do the cleanup. The audit log itself is never cleaned.
r.post('/retention/run', async (req: any, res) => { ok(res, await s.run(req.user.id, req.ip)); });
// Everything held about one person, as JSON, for a data-access request. Each export is audited.
r.get('/export', validate({ query: z.object({ email: z.string().trim().toLowerCase().email() }) }), async (req: any, res) => {
  const out = await s.exportPerson(req.validated.query.email, req.user.id, req.ip);
  if (!out) throw new AppError(404, 'No account has that email address.', 'NOT_FOUND');
  ok(res, out);
});
export default r;
