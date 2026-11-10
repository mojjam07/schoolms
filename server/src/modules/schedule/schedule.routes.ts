import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import { query } from '../../db/pool';
import * as s from './schedule.service';

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine((d) => !Number.isNaN(new Date(d).getTime()), 'Not a real date');
const idParam = z.object({ id: uuid });
const childParam = z.object({ studentId: uuid });
const day = z.number().int().min(1, 'Monday is 1').max(5, 'Friday is 5');
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const range = (v: { startTime?: string; endTime?: string }) => !v.startTime || !v.endTime || v.endTime > v.startTime;
const rangeMsg = { message: 'The end time must be after the start time', path: ['endTime'] };

const slotSchema = z.object({ sessionId: uuid, classId: uuid, subjectId: uuid, dayOfWeek: day, startTime: time, endTime: time, room: optText(40) }).refine(range, rangeMsg);
const slotPatch = z.object({ dayOfWeek: day.optional(), startTime: time.optional(), endTime: time.optional(), room: optText(40) }).refine(range, rangeMsg);
const slotQuery = z.object({ sessionId: uuid, classId: uuid.optional(), teacherId: uuid.optional() });
const scopeQuery = z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming') });

const scheduleBody = z.object({ termId: uuid, title: z.string().trim().min(2).max(120) });
const paperBody = z.object({ classId: uuid, subjectId: uuid, date, startTime: time, endTime: time, venue: optText(80), instructions: optText(500) }).refine(range, rangeMsg);
const paperPatch = z.object({ date: date.optional(), startTime: time.optional(), endTime: time.optional(), venue: optText(80), instructions: optText(500) }).refine(range, rangeMsg);

const ctx = (req: any) => ({ actorId: req.user.id as string, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const r = Router();
const admin = [authenticate, requireRole('admin')];

// ---- administrator: timetable ----
r.get('/timetable', ...admin, validate({ query: slotQuery }), h((q) => s.listTimetable(q.validated.query)));
r.get('/timetable/conflicts', ...admin, validate({ query: z.object({ sessionId: uuid }) }), h((q) => s.timetableConflicts(q.validated.query.sessionId)));
r.post('/timetable', ...admin, validate({ body: slotSchema }), h((q) => s.createSlot(q.validated.body, ctx(q)), 201));
r.patch('/timetable/:id', ...admin, validate({ params: idParam, body: slotPatch }), h((q) => s.updateSlot(q.validated.params.id, q.validated.body, ctx(q))));
r.delete('/timetable/:id', ...admin, validate({ params: idParam }), h(async (q) => { await s.deleteSlot(q.validated.params.id, ctx(q)); return { deleted: true }; }));

// ---- administrator: examination schedules ----
r.get('/exam-schedules', ...admin, validate({ query: z.object({ termId: uuid.optional() }) }), h((q) => s.listExamSchedules(q.validated.query.termId)));
r.post('/exam-schedules', ...admin, validate({ body: scheduleBody }), h((q) => s.createExamSchedule(q.validated.body, ctx(q)), 201));
r.get('/exam-schedules/:id', ...admin, validate({ params: idParam }), h((q) => s.getExamSchedule(q.validated.params.id)));
r.patch('/exam-schedules/:id', ...admin, validate({ params: idParam, body: z.object({ title: z.string().trim().min(2).max(120) }) }), h((q) => s.renameExamSchedule(q.validated.params.id, q.validated.body.title, ctx(q))));
r.delete('/exam-schedules/:id', ...admin, validate({ params: idParam }), h(async (q) => { await s.deleteExamSchedule(q.validated.params.id, ctx(q)); return { deleted: true }; }));
r.post('/exam-schedules/:id/publish', ...admin, validate({ params: idParam }), h((q) => s.setExamPublished(q.validated.params.id, true, ctx(q))));
r.post('/exam-schedules/:id/unpublish', ...admin, validate({ params: idParam }), h((q) => s.setExamPublished(q.validated.params.id, false, ctx(q))));
r.post('/exam-schedules/:id/papers', ...admin, validate({ params: idParam, body: paperBody }), h((q) => s.addPaper(q.validated.params.id, q.validated.body, ctx(q)), 201));
r.patch('/exam-papers/:id', ...admin, validate({ params: idParam, body: paperPatch }), h((q) => s.updatePaper(q.validated.params.id, q.validated.body, ctx(q))));
r.delete('/exam-papers/:id', ...admin, validate({ params: idParam }), h(async (q) => { await s.deletePaper(q.validated.params.id, ctx(q)); return { deleted: true }; }));

// ---- teachers: only lessons and papers for classes and subjects they are assigned to ----
const teacher = [authenticate, requireRole('teacher')];
r.get('/teachers/me/timetable', ...teacher, h((q) => s.teacherTimetable(q.user.id)));
r.get('/teachers/me/exams', ...teacher, validate({ query: scopeQuery }), h((q) => s.teacherExams(q.user.id, q.validated.query.scope)));

// ---- students: their own class only; unpublished schedules never appear ----
const student = [authenticate, requireRole('student')];
r.get('/students/me/timetable', ...student, h((q) => s.studentTimetable(q.user.id)));
r.get('/students/me/exams', ...student, validate({ query: scopeQuery }), h((q) => s.studentExams(q.user.id, q.validated.query.scope)));

// ---- parents: linked children only ----
const linked: RequestHandler = async (req, _res, next) => {
  const found = await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [req.user!.id, req.validated.params.studentId]);
  if (!found.rowCount) throw new AppError(404, 'Child not found', 'NOT_FOUND');
  next();
};
const parent = [authenticate, requireRole('parent')];
r.get('/parents/me/children/:studentId/timetable', ...parent, validate({ params: childParam }), linked, h((q) => s.studentTimetable(q.validated.params.studentId)));
r.get('/parents/me/children/:studentId/exams', ...parent, validate({ params: childParam, query: scopeQuery }), linked, h((q) => s.studentExams(q.validated.params.studentId, q.validated.query.scope)));

export default r;
