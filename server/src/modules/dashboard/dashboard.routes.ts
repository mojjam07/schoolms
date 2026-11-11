import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { ok } from '../../utils/respond';
import * as s from './dashboard.service';
import * as family from './family.service';

const r = Router();
r.get('/admin', authenticate, requireRole('admin'), async (_req, res) => { ok(res, await s.adminOverview()); });
r.get('/teacher', authenticate, requireRole('teacher'), async (req: any, res) => { ok(res, await s.teacherOverview(req.user.id)); });
// Always scoped to the caller: a student sees only themselves, a parent only the children linked to them.
r.get('/student', authenticate, requireRole('student'), async (req: any, res) => { ok(res, await family.studentOverview(req.user.id)); });
r.get('/parent', authenticate, requireRole('parent'), async (req: any, res) => { ok(res, await family.parentOverview(req.user.id)); });
export default r;
