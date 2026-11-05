import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import { query } from '../../db/pool';
import * as att from './attendance.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine((d) => !Number.isNaN(new Date(d).getTime()), 'Not a real date');
const idParam = z.object({ id: uuid });
const childParam = z.object({ studentId: uuid });
const termQuery = z.object({ termId: uuid });
const registerQuery = z.object({ classId: uuid, date });
const saveSchema = z.object({ classId: uuid, date, entries: z.array(z.object({ studentId: uuid, status: z.enum(['present', 'late', 'absent']) })).min(1).max(300) });
const formSchema = z.object({ classId: uuid, sessionId: uuid, teacherId: uuid.nullable() });
const explainSchema = z.object({ date, reason: z.string().trim().min(3, 'Please say what happened').max(500) });
const reviewSchema = z.object({ status: z.enum(['accepted', 'declined']), note: z.string().trim().max(300).optional() });
const listQuery = z.object({ status: z.enum(['pending', 'accepted', 'declined']).optional() });

const actor = (req: any) => ({ id: req.user.id as string, role: req.user.role, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const r = Router();
const admin = [authenticate, requireRole('admin')];
const staff = [authenticate, requireRole('teacher', 'admin')];

r.get('/attendance/form-teachers', ...admin, validate({ query: z.object({ sessionId: uuid }) }), h((q) => att.listFormTeachers(q.validated.query.sessionId)));
r.put('/attendance/form-teachers', ...admin, validate({ body: formSchema }), h((q) => att.setFormTeacher(q.validated.body, actor(q))));
r.get('/teachers/me/form-classes', authenticate, requireRole('teacher'), h((q) => att.myFormClasses(q.user.id)));

r.get('/attendance/register', ...staff, validate({ query: registerQuery }), h((q) => att.getRegister(actor(q), q.validated.query.classId, q.validated.query.date)));
r.put('/attendance/register', ...staff, validate({ body: saveSchema }), h((q) => att.saveRegister(actor(q), q.validated.body)));
r.get('/attendance/class-summary', ...staff, validate({ query: z.object({ classId: uuid, termId: uuid }) }), h((q) => att.classSummary(actor(q), q.validated.query.classId, q.validated.query.termId)));
r.get('/attendance/status', ...admin, validate({ query: z.object({ date }) }), h((q) => att.dayStatus(q.validated.query.date)));

r.get('/attendance/explanations', ...staff, validate({ query: listQuery }), h((q) => att.listExplanations(actor(q), q.validated.query.status)));
r.patch('/attendance/explanations/:id', ...staff, validate({ params: idParam, body: reviewSchema }), h((q) => att.reviewExplanation(actor(q), q.validated.params.id, q.validated.body)));

// ---- parents: only their linked children; they can explain absences but never touch the register ----
const linked: RequestHandler = async (req, _res, next) => {
  const ok2 = await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [req.user!.id, req.validated.params.studentId]);
  if (!ok2.rowCount) throw new AppError(404, 'Child not found', 'NOT_FOUND');
  next();
};
r.get('/parents/me/children/:studentId/attendance', authenticate, requireRole('parent'), validate({ params: childParam, query: termQuery }), linked,
  h(async (q) => ({ summary: await att.studentSummary(q.validated.params.studentId, q.validated.query.termId), days: await att.studentDays(q.validated.params.studentId, q.validated.query.termId) })));
r.post('/parents/me/children/:studentId/explanations', authenticate, requireRole('parent'), validate({ params: childParam, body: explainSchema }), h((q) => att.submitExplanation(actor(q), q.validated.params.studentId, q.validated.body.date, q.validated.body.reason), 201));

// ---- students: their own record, read only ----
r.get('/students/me/attendance', authenticate, requireRole('student'), validate({ query: termQuery }),
  h(async (q) => ({ summary: await att.studentSummary(q.user.id, q.validated.query.termId), days: (await att.studentDays(q.user.id, q.validated.query.termId)).map(({ date: d, status }) => ({ date: d, status })) })));

export default r;
