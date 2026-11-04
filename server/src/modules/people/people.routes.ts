import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as p from './people.service';
import * as v from './people.schemas';

const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };

export const adminPeople = Router();
const admin = [authenticate, requireRole('admin')];
adminPeople.get('/students', ...admin, validate({ query: v.listStudentsSchema }), h((q) => p.listStudents(q.validated.query)));
adminPeople.get('/parent-links', ...admin, validate({ query: v.listLinksSchema }), h((q) => p.listLinks(q.validated.query)));
adminPeople.post('/parent-links', ...admin, validate({ body: v.linkSchema }), h((q) => p.createLink(q.validated.body, q.user.id, q.ip), 201));
adminPeople.delete('/parent-links/:parentId/:studentId', ...admin, validate({ params: v.unlinkParams }),
  h(async (q) => { await p.deleteLink(q.validated.params.parentId, q.validated.params.studentId, q.user.id, q.ip); return { deleted: true }; }));

export const meRoutes = Router();
meRoutes.get('/parents/me/children', authenticate, requireRole('parent'), h((q) => p.childrenOfParent(q.user.id)));
meRoutes.get('/teachers/me/assignments', authenticate, requireRole('teacher'), h((q) => p.assignmentsOfTeacher(q.user.id)));
meRoutes.get('/students/me/class', authenticate, requireRole('student'), h((q) => p.myClassAndSubjects(q.user.id)));
