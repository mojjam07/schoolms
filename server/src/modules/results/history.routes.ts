import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { ok } from '../../utils/respond';
import * as s from './history.service';

const r = Router();
// A student sees only their own history; a parent sees only the children linked to them. Published terms only.
r.get('/me', authenticate, requireRole('student'), async (req: any, res) => { ok(res, await s.historyOf(req.user.id)); });
r.get('/children', authenticate, requireRole('parent'), async (req: any, res) => { ok(res, await s.historyForParent(req.user.id)); });
export default r;
