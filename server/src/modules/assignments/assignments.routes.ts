import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './assignments.service';
import * as v from './assignments.schemas';

const actor = (req: any) => ({ id: req.user.id as string, role: req.user.role, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };

const r = Router();
const teacher = [authenticate, requireRole('teacher')];
const staff = [authenticate, requireRole('teacher', 'admin')];
const anyRole = [authenticate, requireRole('teacher', 'admin', 'student')];

r.get('/assignments', ...teacher, h((q) => s.listMyAssignments(actor(q))));
r.post('/assignments', ...teacher, validate({ body: v.createAssignmentSchema }), h((q) => s.createAssignment(actor(q), q.validated.body), 201));
r.get('/assignments/:id', ...anyRole, validate({ params: v.idParam }), h((q) => s.getAssignment(actor(q), q.validated.params.id)));
r.patch('/assignments/:id', ...teacher, validate({ params: v.idParam, body: v.updateAssignmentSchema }), h((q) => s.updateAssignment(actor(q), q.validated.params.id, q.validated.body)));

r.get('/assignments/:id/roster', ...staff, validate({ params: v.idParam }), h((q) => s.roster(actor(q), q.validated.params.id)));
r.get('/assignments/:id/students/:studentId/submission', ...staff, validate({ params: v.studentParam }), h((q) => s.studentSubmission(actor(q), q.validated.params.id, q.validated.params.studentId)));
r.post('/assignments/:id/return-graded', ...teacher, validate({ params: v.idParam }), h((q) => s.returnAllGraded(actor(q), q.validated.params.id)));

r.get('/assignments/:id/my-submission', authenticate, requireRole('student'), validate({ params: v.idParam }), h((q) => s.mySubmission(actor(q), q.validated.params.id)));
r.post('/assignments/:id/submissions', authenticate, requireRole('student'), validate({ params: v.idParam, body: v.submitSchema }), h((q) => s.submit(actor(q), q.validated.params.id, q.validated.body), 201));

r.put('/submissions/:id/grade', ...teacher, validate({ params: v.idParam, body: v.gradeSchema }), h((q) => s.grade(actor(q), q.validated.params.id, q.validated.body)));
r.post('/submissions/:id/return', ...teacher, validate({ params: v.idParam }), h((q) => s.returnSubmission(actor(q), q.validated.params.id)));

r.get('/students/me/assignments', authenticate, requireRole('student'), h((q) => s.studentAssignments(q.user.id)));

export default r;
