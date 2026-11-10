import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as svc from './rollover.service';

const uuid = z.string().uuid();
const body = z.object({
  fromSessionId: uuid, toSessionId: uuid,
  classMap: z.record(uuid, z.union([uuid, z.literal('graduate')])).optional(),
  repeatStudentIds: z.array(uuid).max(2000).optional(), excludeStudentIds: z.array(uuid).max(2000).optional(),
  createMissingClasses: z.boolean().optional(),
  carryFormTeachers: z.boolean().optional(), carryTeachingAssignments: z.boolean().optional(), carryTimetable: z.boolean().optional(),
});
const h = (fn: (req: any) => Promise<unknown>): RequestHandler => async (req, res) => { ok(res, await fn(req)); };
const r = Router();
const admin = [authenticate, requireRole('admin')];
r.post('/rollover/preview', ...admin, validate({ body }), h((q) => svc.preview(q.validated.body)));
r.post('/rollover/run', ...admin, validate({ body }), h((q) => svc.execute(q.validated.body, { actorId: q.user.id, ip: q.ip })));
export default r;
