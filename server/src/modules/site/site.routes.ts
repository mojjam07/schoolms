import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import * as site from './site.service';
import * as enq from './enquiries.service';
import * as v from './site.schemas';
import { SECTIONS, type Section } from './site.defaults';

const ctx = (req: any) => ({ actorId: req.user.id as string, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const limiter = (windowMs: number, limit: number, what: string) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: `Too many ${what}. Please wait a while and try again.` } } });

// ================= public (no sign-in) =================
export const publicRoutes = Router();
publicRoutes.use(limiter(15 * 60 * 1000, 600, 'requests'));
publicRoutes.get('/site', h(() => site.publicSite()));
publicRoutes.get('/news', validate({ query: v.publicListQuery }), h((q) => site.publicPosts(q.validated.query.page, q.validated.query.pageSize)));
publicRoutes.get('/news/:slug', validate({ params: v.slugParam }), h((q) => site.publicPost(q.validated.params.slug)));
publicRoutes.get('/announcements', h(() => site.publicAnnouncements()));
publicRoutes.get('/events', validate({ query: v.eventsQuery }), h((q) => site.publicEvents(q.validated.query.when)));
publicRoutes.get('/facilities', h(() => site.publicFacilities()));
publicRoutes.get('/gallery', h(() => site.publicGallery()));
publicRoutes.get('/academics', h(() => site.publicAcademics()));
publicRoutes.get('/media/:id', validate({ params: v.idParam }), async (req, res) => {
  const { file, data } = await site.publicMedia(req.validated.params.id);
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Length', data.length);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // the website lives on a different address from the API
  res.end(data);
});
publicRoutes.post('/admissions/apply', limiter(60 * 60 * 1000, 20, 'applications from this connection'), validate({ body: v.applySchema }), h((q) => enq.apply(q.validated.body), 201));
publicRoutes.post('/admissions/status', limiter(15 * 60 * 1000, 20, 'status checks'), validate({ body: v.statusLookupSchema }), h((q) => enq.lookup(q.validated.body.reference, q.validated.body.email)));
publicRoutes.post('/contact', limiter(60 * 60 * 1000, 30, 'messages from this connection'), validate({ body: v.contactSchema }), h((q) => enq.sendMessage(q.validated.body), 201));

// ================= administrator =================
export const adminSiteRoutes = Router();
const admin = [authenticate, requireRole('admin')];
adminSiteRoutes.get('/checklist', ...admin, h(() => site.checklist()));
adminSiteRoutes.get('/content', ...admin, h(async () => { const c = await site.getContent(); return { content: c, placeholders: (await site.checklist()).placeholders }; }));
adminSiteRoutes.put('/content/:section', ...admin, h(async (q) => {
  const section = q.params.section as Section;
  if (!SECTIONS.includes(section)) throw new AppError(404, 'Unknown page section', 'NOT_FOUND');
  const parsed = v.contentSchemas[section].safeParse(q.body);
  if (!parsed.success) throw new AppError(400, 'Please check the highlighted fields', 'VALIDATION_ERROR', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  return site.saveSection(section, parsed.data, ctx(q));
}));

adminSiteRoutes.get('/posts', ...admin, validate({ query: v.listPostsQuery }), h((q) => site.listPosts(q.validated.query)));
adminSiteRoutes.get('/posts/:id', ...admin, validate({ params: v.idParam }), h((q) => site.getPost(q.validated.params.id)));
adminSiteRoutes.post('/posts', ...admin, validate({ body: v.createPostSchema }), h((q) => site.createPost(q.validated.body, ctx(q)), 201));
adminSiteRoutes.patch('/posts/:id', ...admin, validate({ params: v.idParam, body: v.updatePostSchema }), h((q) => site.updatePost(q.validated.params.id, q.validated.body, ctx(q))));
adminSiteRoutes.delete('/posts/:id', ...admin, validate({ params: v.idParam }), h(async (q) => { await site.deletePost(q.validated.params.id, ctx(q)); return { deleted: true }; }));

adminSiteRoutes.get('/events', ...admin, h(() => site.listEvents()));
adminSiteRoutes.post('/events', ...admin, validate({ body: v.createEventSchema }), h((q) => site.createEvent(q.validated.body, ctx(q)), 201));
adminSiteRoutes.patch('/events/:id', ...admin, validate({ params: v.idParam, body: v.updateEventSchema }), h((q) => site.updateEvent(q.validated.params.id, q.validated.body, ctx(q))));
adminSiteRoutes.delete('/events/:id', ...admin, validate({ params: v.idParam }), h(async (q) => { await site.deleteEvent(q.validated.params.id, ctx(q)); return { deleted: true }; }));

adminSiteRoutes.get('/facilities', ...admin, h(() => site.listFacilities()));
adminSiteRoutes.post('/facilities', ...admin, validate({ body: v.createFacilitySchema }), h((q) => site.createFacility(q.validated.body, ctx(q)), 201));
adminSiteRoutes.patch('/facilities/:id', ...admin, validate({ params: v.idParam, body: v.updateFacilitySchema }), h((q) => site.updateFacility(q.validated.params.id, q.validated.body, ctx(q))));
adminSiteRoutes.delete('/facilities/:id', ...admin, validate({ params: v.idParam }), h(async (q) => { await site.deleteFacility(q.validated.params.id, ctx(q)); return { deleted: true }; }));

adminSiteRoutes.get('/gallery', ...admin, h(() => site.listGallery()));
adminSiteRoutes.post('/gallery', ...admin, validate({ body: v.createGallerySchema }), h((q) => site.addGalleryImage(q.validated.body, ctx(q)), 201));
adminSiteRoutes.patch('/gallery/:id', ...admin, validate({ params: v.idParam, body: v.updateGallerySchema }), h((q) => site.updateGalleryImage(q.validated.params.id, q.validated.body, ctx(q))));
adminSiteRoutes.delete('/gallery/:id', ...admin, validate({ params: v.idParam }), h(async (q) => { await site.deleteGalleryImage(q.validated.params.id, ctx(q)); return { deleted: true }; }));

adminSiteRoutes.get('/applications', ...admin, validate({ query: v.appListQuery }), h((q) => enq.listApplications(q.validated.query)));
adminSiteRoutes.get('/applications/:id', ...admin, validate({ params: v.idParam }), h((q) => enq.getApplication(q.validated.params.id)));
adminSiteRoutes.patch('/applications/:id/status', ...admin, validate({ params: v.idParam, body: v.appStatusSchema }), h((q) => enq.setApplicationStatus(q.validated.params.id, q.validated.body, q.user.id, q.ip)));
adminSiteRoutes.get('/messages', ...admin, validate({ query: v.messageListQuery }), h((q) => enq.listMessages(q.validated.query)));
adminSiteRoutes.patch('/messages/:id', ...admin, validate({ params: v.idParam, body: v.messageStatusSchema }), h((q) => enq.setMessageStatus(q.validated.params.id, q.validated.body.status, q.user.id, q.ip)));
