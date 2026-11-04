import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import { query } from '../../db/pool';
import * as comp from './components.service';
import * as grading from './grading.service';
import * as results from './results.service';
import * as v from './results.schemas';

const actor = (req: any) => ({ id: req.user.id as string, role: req.user.role, ip: req.ip as string | undefined });
const ctx = (req: any) => ({ actorId: req.user.id as string, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const r = Router();
const admin = [authenticate, requireRole('admin')];
const scorers = [authenticate, requireRole('teacher', 'admin')];

// ---- grading scale and assessment columns (administrator) ----
r.get('/results/grading', authenticate, requireRole('admin', 'teacher'), h(async () => ({ bands: await grading.getBands() })));
r.put('/results/grading', ...admin, validate({ body: v.bandsSchema }), h(async (q) => ({ bands: await grading.setBands(q.validated.body.bands, ctx(q)) })));
r.post('/results/grading/template', ...admin, h(async (q) => ({ bands: await grading.applyTemplate(ctx(q)) })));

r.get('/results/components', authenticate, requireRole('admin', 'teacher'), validate({ query: v.sessionQuery }), h((q) => comp.listComponents(q.validated.query.sessionId)));
r.post('/results/components', ...admin, validate({ body: v.createComponentSchema }), h((q) => comp.createComponent(q.validated.body, ctx(q)), 201));
r.post('/results/components/template', ...admin, validate({ body: v.templateSchema }), h((q) => comp.applyTemplate(q.validated.body.sessionId, ctx(q))));
r.patch('/results/components/:id', ...admin, validate({ params: v.idParam, body: v.updateComponentSchema }), h((q) => comp.updateComponent(q.validated.params.id, q.validated.body, ctx(q))));
r.delete('/results/components/:id', ...admin, validate({ params: v.idParam }), h(async (q) => { await comp.deleteComponent(q.validated.params.id, ctx(q)); return { deleted: true }; }));

// ---- score entry ----
r.get('/results/sheet', ...scorers, validate({ query: v.sheetQuery }), h((q) => results.getSheet(actor(q), q.validated.query.termId, q.validated.query.classId, q.validated.query.subjectId)));
r.put('/results/sheet', ...scorers, validate({ body: v.saveSheetSchema }), h((q) => results.saveSheet(actor(q), q.validated.body)));

// ---- results overview, publishing, remarks (administrator) ----
r.get('/results/status', ...admin, validate({ query: v.termQuery }), h((q) => results.status(q.validated.query.termId)));
r.get('/results/class', ...admin, validate({ query: v.termClassQuery }), h((q) => results.classResults(q.validated.query.termId, q.validated.query.classId)));
r.post('/results/publish', ...admin, validate({ body: v.publishSchema }), h((q) => results.publish(actor(q), q.validated.body)));
r.post('/results/unpublish', ...admin, validate({ body: v.termClassQuery }), h((q) => results.unpublish(actor(q), q.validated.body.termId, q.validated.body.classId)));
r.put('/results/remarks', ...admin, validate({ body: v.remarkSchema }), h((q) => results.setRemark(actor(q), q.validated.body.termId, q.validated.body.studentId, q.validated.body.remark)));
r.get('/results/report-card', ...admin, validate({ query: v.reportQuery }), h((q) => results.reportCard(q.validated.query.studentId, q.validated.query.termId, 'preview')));

// ---- students: their own published report cards ----
r.get('/students/me/report-cards', authenticate, requireRole('student'), h((q) => results.publishedTermsFor(q.user.id)));
r.get('/students/me/report-cards/:termId', authenticate, requireRole('student'), validate({ params: v.termParam }), h((q) => results.reportCard(q.user.id, q.validated.params.termId, 'published')));

// ---- parents: only their linked children, only published ----
const linked: RequestHandler = async (req, _res, next) => {
  const ok2 = await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [req.user!.id, req.validated.params.studentId]);
  if (!ok2.rowCount) throw new AppError(404, 'Report card not found', 'NOT_FOUND'); // the same answer as "no such child"
  next();
};
r.get('/parents/me/children/:studentId/report-cards', authenticate, requireRole('parent'), validate({ params: v.childParam }), linked, h((q) => results.publishedTermsFor(q.validated.params.studentId)));
r.get('/parents/me/children/:studentId/report-cards/:termId', authenticate, requireRole('parent'), validate({ params: v.childTermParam }), linked, h((q) => results.reportCard(q.validated.params.studentId, q.validated.params.termId, 'published')));

export default r;
