import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { ok } from '../../utils/respond';
import * as s from './dashboard.service';

const r = Router();
r.get('/admin', authenticate, requireRole('admin'), async (_req, res) => { ok(res, await s.adminOverview()); });
r.get('/teacher', authenticate, requireRole('teacher'), async (req: any, res) => { ok(res, await s.teacherOverview(req.user.id)); });
export default r;
