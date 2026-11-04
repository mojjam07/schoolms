import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './academic.service';
import * as v from './academic.schemas';

const ctx = (req: any) => ({ actorId: req.user.id as string, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };

const r = Router();
r.use(authenticate);
const admin = requireRole('admin');

// Reading school structure is open to any signed-in user; changing it is admin only.
r.get('/sessions', h(() => s.listSessions()));
r.post('/sessions', admin, validate({ body: v.createSessionSchema }), h((q) => s.createSession(q.validated.body, ctx(q)), 201));
r.patch('/sessions/:id', admin, validate({ params: v.idParam, body: v.updateSessionSchema }), h((q) => s.updateSession(q.validated.params.id, q.validated.body, ctx(q))));
r.post('/sessions/:id/set-current', admin, validate({ params: v.idParam }), h((q) => s.setCurrentSession(q.validated.params.id, ctx(q))));

r.get('/terms', validate({ query: v.listTermsSchema }), h((q) => s.listTerms(q.validated.query.sessionId)));
r.post('/terms', admin, validate({ body: v.createTermSchema }), h((q) => s.createTerm(q.validated.body, ctx(q)), 201));
r.patch('/terms/:id', admin, validate({ params: v.idParam, body: v.updateTermSchema }), h((q) => s.updateTerm(q.validated.params.id, q.validated.body, ctx(q))));
r.post('/terms/:id/set-current', admin, validate({ params: v.idParam }), h((q) => s.setCurrentTerm(q.validated.params.id, ctx(q))));

r.get('/classes', h(() => s.listClasses()));
r.post('/classes', admin, validate({ body: v.createClassSchema }), h((q) => s.createClass(q.validated.body, ctx(q)), 201));
r.patch('/classes/:id', admin, validate({ params: v.idParam, body: v.updateClassSchema }), h((q) => s.updateClass(q.validated.params.id, q.validated.body, ctx(q))));
r.get('/classes/:id/subjects', validate({ params: v.idParam }), h((q) => s.getClassSubjects(q.validated.params.id)));
r.put('/classes/:id/subjects', admin, validate({ params: v.idParam, body: v.classSubjectsSchema }), h((q) => s.setClassSubjects(q.validated.params.id, q.validated.body.subjectIds, ctx(q))));

r.get('/subjects', h(() => s.listSubjects()));
r.post('/subjects', admin, validate({ body: v.createSubjectSchema }), h((q) => s.createSubject(q.validated.body, ctx(q)), 201));
r.patch('/subjects/:id', admin, validate({ params: v.idParam, body: v.updateSubjectSchema }), h((q) => s.updateSubject(q.validated.params.id, q.validated.body, ctx(q))));

r.get('/teaching-assignments', admin, validate({ query: v.listAssignmentsSchema }), h((q) => s.listAssignments(q.validated.query)));
r.post('/teaching-assignments', admin, validate({ body: v.createAssignmentSchema }), h((q) => s.createAssignment(q.validated.body, ctx(q)), 201));
r.delete('/teaching-assignments/:id', admin, validate({ params: v.idParam }), h(async (q) => { await s.deleteAssignment(q.validated.params.id, ctx(q)); return { deleted: true }; }));

r.get('/enrolments', admin, validate({ query: v.listEnrolmentsSchema }), h((q) => s.listEnrolments(q.validated.query)));
r.post('/enrolments', admin, validate({ body: v.enrolSchema }), h((q) => s.enrol(q.validated.body, ctx(q))));
r.patch('/enrolments/:id/status', admin, validate({ params: v.idParam, body: v.enrolmentStatusSchema }), h(async (q) => { await s.setEnrolmentStatus(q.validated.params.id, q.validated.body.status, ctx(q)); return { updated: true }; }));

export default r;
