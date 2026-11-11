import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { query } from './db/pool';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import academicRoutes from './modules/academic/academic.routes';
import assignmentRoutes from './modules/assignments/assignments.routes';
import { adminSiteRoutes, publicRoutes } from './modules/site/site.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import rolloverRoutes from './modules/rollover/rollover.routes';
import scheduleRoutes from './modules/schedule/schedule.routes';
import resultsRoutes from './modules/results/results.routes';
import feesRoutes from './modules/fees/fees.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import learningRoutes from './modules/learning/learning.routes';
import { adminPeople, meRoutes } from './modules/people/people.routes';
import { ok } from './utils/respond';
import { handleWebhook } from './modules/fees/paystack.service';
import auditRoutes from "./modules/audit/audit.routes";

export const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Paystack signs the exact bytes it sends, so this route reads the raw body and must come before the JSON parser.
app.post('/api/webhooks/paystack', express.raw({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
  try {
    const r = await handleWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.header('x-paystack-signature'));
    res.status(r.code).send(r.body);
  } catch (e) { next(e); } // a 5xx makes Paystack retry later, which is what we want if something briefly failed
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await query('select 1');
    ok(res, { status: 'ok' });
  } catch {
    res.status(503).json({ success: false, error: { code: 'DB_DOWN', message: 'Database unavailable' } });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api', adminPeople);
app.use('/api', meRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', learningRoutes);
app.use('/api', assignmentRoutes);
app.use('/api', feesRoutes);
app.use('/api', resultsRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', rolloverRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin/site', adminSiteRoutes);
app.use('/api/admin/audit-logs', auditRoutes);

app.use(notFound);
app.use(errorHandler);
