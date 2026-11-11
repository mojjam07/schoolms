import { Router, type RequestHandler } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/respond';
import { query } from '../../db/pool';
import * as fees from './fees.service';
import * as msg from './fees.messages';
import * as ps from './paystack.service';
import rateLimit from 'express-rate-limit';
import * as v from './fees.schemas';
import * as exp from './fees.export';

const ctx = (req: any) => ({ actorId: req.user.id as string, ip: req.ip as string | undefined });
const h = (fn: (req: any) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => { ok(res, await fn(req), status); };
const r = Router();
const admin = [authenticate, requireRole('admin')];

// ---------- administrator ----------
r.get('/fees/categories', ...admin, h(() => fees.listCategories()));
r.post('/fees/categories', ...admin, validate({ body: v.createCategorySchema }), h((q) => fees.createCategory(q.validated.body, ctx(q)), 201));
r.patch('/fees/categories/:id', ...admin, validate({ params: v.idParam, body: v.updateCategorySchema }), h((q) => fees.updateCategory(q.validated.params.id, q.validated.body, ctx(q))));
r.get('/fees/schedule', ...admin, validate({ query: v.scheduleQuery }), h((q) => fees.getSchedule(q.validated.query.termId, q.validated.query.classId)));
r.put('/fees/schedule', ...admin, validate({ body: v.setScheduleSchema }), h((q) => fees.setSchedule(q.validated.body, ctx(q))));

r.post('/fees/invoices/generate', ...admin, validate({ body: v.generateSchema }), h((q) => fees.generateInvoices(q.validated.body, ctx(q))));
r.get('/fees/invoices', ...admin, validate({ query: v.listInvoicesSchema }), h((q) => fees.listInvoices(q.validated.query)));
r.get('/fees/invoices/:id', ...admin, validate({ params: v.idParam }), h((q) => fees.getInvoice(q.validated.params.id)));
r.post('/fees/invoices/:id/lines', ...admin, validate({ params: v.idParam, body: v.addLineSchema }), h((q) => fees.addLine(q.validated.params.id, q.validated.body, ctx(q)), 201));
r.patch('/fees/invoices/:id/due-date', ...admin, validate({ params: v.idParam, body: v.dueDateSchema }), h((q) => fees.setDueDate(q.validated.params.id, q.validated.body.dueDate, ctx(q))));
r.post('/fees/invoices/:id/cancel', ...admin, validate({ params: v.idParam, body: v.cancelSchema }), h((q) => fees.cancelInvoice(q.validated.params.id, q.validated.body.reason, ctx(q))));
r.post('/fees/invoices/:id/payments', ...admin, validate({ params: v.idParam, body: v.paymentSchema }), h(async (q) => {
  const res = await fees.recordPayment(q.validated.params.id, q.validated.body, ctx(q));
  await msg.notifyPaymentReceived(res.paymentId);
  return res;
}, 201));
r.post('/fees/payments/:id/reverse', ...admin, validate({ params: v.idParam, body: v.reverseSchema }), h((q) => fees.reversePayment(q.validated.params.id, q.validated.body.reason, ctx(q))));
const csv = (name: string, fn: (req: any) => Promise<string>): RequestHandler => async (req, res) => {
  const body = await fn(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'no-store');
  res.send(body);
};
r.get('/fees/export/summary.csv', ...admin, validate({ query: v.reportQuery }), csv('fees-summary.csv', (q) => exp.summaryCsv(q.validated.query.termId)));
r.get('/fees/export/invoices.csv', ...admin, validate({ query: v.listInvoicesSchema.partial() }), csv('invoices.csv', (q) => exp.invoicesCsv(q.validated.query)));
r.get('/fees/export/payments.csv', ...admin, validate({ query: v.reportQuery }), csv('payments.csv', (q) => exp.paymentsCsv(q.validated.query.termId)));
r.get('/fees/report', ...admin, validate({ query: v.reportQuery }), h((q) => fees.report(q.validated.query.termId)));
r.post('/fees/reminders', ...admin, validate({ body: v.remindersSchema }), h((q) => msg.sendReminders(q.validated.body, q.user.id, q.ip)));

// ---------- receipts: administrator, or a guardian linked to the student ----------
r.get('/fees/payments/:id/receipt', authenticate, requireRole('admin', 'parent'), validate({ params: v.idParam }), h(async (q) => {
  const receipt = await fees.getReceipt(q.validated.params.id);
  if (q.user.role === 'parent') {
    const link = await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [q.user.id, receipt.studentId]);
    if (!link.rowCount) throw new AppError(404, 'Receipt not found', 'NOT_FOUND'); // same answer as "no such receipt"
  }
  const { studentId: _s, ...safe } = receipt; void _s;
  return safe;
}));

// ---------- parents: only their linked children ----------
const myChildrenInvoices = `select i.id from invoices i join parent_students ps on ps.student_id = i.student_id and ps.parent_id = $1`;
r.get('/parents/me/invoices', authenticate, requireRole('parent'), h(async (q) => {
  const { rows } = await query(`${fees.invoiceSelect} where i.id in (${myChildrenInvoices}) order by i.created_at desc`, [q.user.id]);
  return rows.map(fees.invoiceRow);
}));
r.get('/parents/me/invoices/:id', authenticate, requireRole('parent'), validate({ params: v.idParam }), h(async (q) => {
  const mine = await query(`${myChildrenInvoices} where i.id = $2`, [q.user.id, q.validated.params.id]);
  if (!mine.rowCount) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
  const { guardians: _g, ...inv } = await fees.getInvoice(q.validated.params.id); void _g; // other guardians' details are not the parent's business
  // Payments that were started but not confirmed in the last day, so a parent who closed the tab can check on them.
  const pending = (await query(
    "select reference, amount_kobo, created_at from paystack_transactions where invoice_id = $1 and payer_id = $2 and status = 'pending' and created_at > now() - interval '1 day' order by created_at desc",
    [q.validated.params.id, q.user.id])).rows;
  return { ...inv, onlinePaymentAvailable: ps.onlinePaymentAvailable(), pendingPayments: pending.map((p) => ({ reference: p.reference, amountKobo: p.amount_kobo, startedAt: p.created_at })) };
}));

const payLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes.' } } });
r.post('/parents/me/invoices/:id/pay', authenticate, requireRole('parent'), payLimiter, validate({ params: v.idParam, body: v.payOnlineSchema }),
  h(async (q) => {
    const me = (await query('select email from users where id = $1', [q.user.id])).rows[0];
    return ps.initiate({ id: q.user.id, email: me.email }, q.validated.params.id, q.validated.body.amountKobo, q.ip);
  }));
// The browser coming back from Paystack proves nothing. This asks Paystack itself, then counts the payment (or not).
r.post('/parents/me/payments/verify', authenticate, requireRole('parent'), payLimiter, validate({ body: v.verifySchema }), h((q) => ps.verifyForParent(q.user.id, q.validated.body.reference)));

r.get('/fees/online-payments', ...admin, validate({ query: v.onlineListQuery }), h((q) => ps.listTransactions(q.validated.query)));
r.post('/fees/online-payments/:id/recheck', ...admin, validate({ params: v.idParam }), h((q) => ps.recheck(q.validated.params.id, q.user.id, q.ip)));

// ---------- students: their own tuition status, read only ----------
r.get('/students/me/invoices', authenticate, requireRole('student'), h(async (q) => {
  const { rows } = await query(`${fees.invoiceSelect} where i.student_id = $1 order by i.created_at desc`, [q.user.id]);
  return rows.map(fees.invoiceRow).map((i) => ({ id: i.id, number: i.number, termName: i.termName, sessionName: i.sessionName, status: i.status, totalKobo: i.totalKobo, paidKobo: i.paidKobo, balanceKobo: i.balanceKobo, dueDate: i.dueDate, overdue: i.overdue }));
}));

export default r;
