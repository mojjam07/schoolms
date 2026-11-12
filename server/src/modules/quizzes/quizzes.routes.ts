import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/respond';
import * as s from './quizzes.service';

const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const id = z.object({ id: z.string().uuid() });
const attemptId = z.object({ attemptId: z.string().uuid() });
const answers = z.array(z.object({ questionId: z.string().uuid(), optionId: z.string().uuid().nullable() })).max(100);

const quizBody = z.object({
  classId: z.string().uuid(), subjectId: z.string().uuid(), title: z.string().trim().min(1, 'Add a title').max(150), instructions: z.string().trim().max(2000).default(''),
  opensAt: z.string().datetime({ offset: true }).nullish(), closesAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(300).nullish(), maxAttempts: z.number().int().min(1).max(5).default(1), showAnswers: z.boolean().default(false),
  questions: z.array(z.object({
    text: z.string().trim().min(1, 'Every question needs text').max(1000), marks: z.number().positive().max(100).default(1),
    options: z.array(z.object({ text: z.string().trim().min(1, 'Every option needs text').max(500), isCorrect: z.boolean() })).min(2, 'Give at least two options').max(6),
  })).max(60),
}).refine((b) => !b.opensAt || new Date(b.opensAt) < new Date(b.closesAt), { message: 'The quiz must open before it closes', path: ['opensAt'] });

const r = Router();
const teacher = [authenticate, requireRole('teacher')];
r.get('/teacher/options', ...teacher, h((q) => s.teacherOptions(q.user.id)));
r.get('/teacher', ...teacher, h((q) => s.teacherList(q.user.id)));
r.post('/teacher', ...teacher, validate({ body: quizBody }), h((q) => s.createQuiz(q.user.id, q.validated.body, q.ip), 201));
r.get('/teacher/:id', ...teacher, validate({ params: id }), h((q) => s.teacherDetail(q.user.id, q.validated.params.id)));
r.put('/teacher/:id', ...teacher, validate({ params: id, body: quizBody }), h((q) => s.updateQuiz(q.user.id, q.validated.params.id, q.validated.body, q.ip)));
r.delete('/teacher/:id', ...teacher, validate({ params: id }), h((q) => s.deleteDraft(q.user.id, q.validated.params.id, q.ip)));
r.post('/teacher/:id/publish', ...teacher, validate({ params: id }), h((q) => s.publish(q.user.id, q.validated.params.id, q.ip)));
r.post('/teacher/:id/close', ...teacher, validate({ params: id }), h((q) => s.closeQuiz(q.user.id, q.validated.params.id, q.ip)));

const student = [authenticate, requireRole('student')];
r.get('/student', ...student, h((q) => s.studentList(q.user.id)));
r.post('/student/:id/start', ...student, validate({ params: id }), h((q) => s.startAttempt(q.user.id, q.validated.params.id), 201));
r.get('/attempts/:attemptId', ...student, validate({ params: attemptId }), h((q) => s.getAttempt(q.user.id, q.validated.params.attemptId)));
r.put('/attempts/:attemptId/answers', ...student, validate({ params: attemptId, body: z.object({ answers }) }), h((q) => s.saveAnswers(q.user.id, q.validated.params.attemptId, q.validated.body.answers)));
r.post('/attempts/:attemptId/submit', ...student, validate({ params: attemptId, body: z.object({ answers: answers.optional() }) }), h((q) => s.submitAttempt(q.user.id, q.validated.params.attemptId, q.validated.body.answers)));

r.get('/parent', authenticate, requireRole('parent'), h((q) => s.parentSummary(q.user.id)));
export default r;
