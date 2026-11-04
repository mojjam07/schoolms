import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import * as files from './files.service';
import * as svc from './learning.service';
import * as v from './learning.schemas';

const actor = (req: any) => ({ id: req.user.id as string, role: req.user.role, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: files.MAX_BYTES, files: 1 } });
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many uploads. Please wait a few minutes.' } },
});

const r = Router();
const teacher = [authenticate, requireRole('teacher')];

// ---- files ----
// Teachers upload lesson resources and assignment attachments; students upload only their own submission files.
const PURPOSES: Record<string, string[]> = { teacher: ['resource', 'assignment'], student: ['submission'], admin: ['public'] };
r.post('/files', authenticate, requireRole('teacher', 'student', 'admin'), uploadLimiter, upload.single('file'), validate({ query: v.uploadQuery }), h(async (req) => {
  if (!req.file) throw new AppError(400, 'Choose a file to upload.', 'BAD_UPLOAD');
  const allowed = PURPOSES[req.user.role];
  const purpose = req.validated.query.purpose ?? allowed[0];
  if (!allowed.includes(purpose)) throw new AppError(403, 'You cannot upload this kind of file.', 'FORBIDDEN');
  return files.saveUpload(req.user.id, purpose, req.file);
}, 201));

r.get('/files/:id/download', authenticate, validate({ params: v.idParam }), async (req, res) => {
  const { file, data } = await files.loadForDownload(req.user!, req.validated.params.id);
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Length', data.length);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(data);
});

// ---- lesson notes ----
r.get('/lesson-notes', ...teacher, validate({ query: v.myListSchema }), h((q) => svc.listMyNotes(actor(q), q.validated.query)));
r.post('/lesson-notes', ...teacher, validate({ body: v.createNoteSchema }), h((q) => svc.createNote(actor(q), q.validated.body), 201));
r.get('/lesson-notes/:id', authenticate, requireRole('teacher', 'student', 'admin'), validate({ params: v.idParam }), h((q) => svc.getNote(actor(q), q.validated.params.id)));
r.patch('/lesson-notes/:id', ...teacher, validate({ params: v.idParam, body: v.updateNoteSchema }), h((q) => svc.updateNote(actor(q), q.validated.params.id, q.validated.body)));

// ---- video lessons ----
r.get('/video-lessons', ...teacher, validate({ query: v.myListSchema }), h((q) => svc.listMyVideos(actor(q), q.validated.query)));
r.post('/video-lessons', ...teacher, validate({ body: v.createVideoSchema }), h((q) => svc.createVideo(actor(q), q.validated.body), 201));
r.get('/video-lessons/:id', authenticate, requireRole('teacher', 'student', 'admin'), validate({ params: v.idParam }), h((q) => svc.getVideo(actor(q), q.validated.params.id)));
r.patch('/video-lessons/:id', ...teacher, validate({ params: v.idParam, body: v.updateVideoSchema }), h((q) => svc.updateVideo(actor(q), q.validated.params.id, q.validated.body)));
r.delete('/video-lessons/:id', ...teacher, validate({ params: v.idParam }), h(async (q) => { await svc.deleteVideo(actor(q), q.validated.params.id); return { deleted: true }; }));

// ---- student feed ----
r.get('/students/me/learning', authenticate, requireRole('student'), validate({ query: v.learningQuery }), h((q) => svc.studentLearning(q.user.id, q.validated.query)));

export default r;
