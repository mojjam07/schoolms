import crypto from 'crypto';
import { env, isProd } from '../../config/env';
import { pool, query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { naira } from '../../utils/money';
import { audit } from '../../services/audit';
import { notifyPaymentReceived } from './fees.messages';
import { invoiceStatus } from './fees.service';

if (isProd && env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')) console.warn('[paystack] Production is using a TEST key: no real money will move.');

export const onlinePaymentAvailable = () => !!env.PAYSTACK_SECRET_KEY;
const MIN_KOBO = 10_000; // ₦100, or the whole balance if that is smaller

async function paystack(path: string, init: { method?: string; body?: unknown } = {}) {
  if (!env.PAYSTACK_SECRET_KEY) throw new AppError(503, 'Online payment is not set up yet. Please pay at the school office.', 'PAYMENTS_UNAVAILABLE');
  let res: Response;
  try {
    res = await fetch(`${env.PAYSTACK_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, 'Could not reach Paystack. Nothing was charged. Please try again in a moment.', 'GATEWAY_UNREACHABLE');
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    console.error(`[paystack] ${path} failed (${res.status}):`, json?.message);
    throw new AppError(502, 'Paystack could not start this payment. Nothing was charged. Please try again.', 'GATEWAY_ERROR');
  }
  return json.data;
}

// ---------------- starting a payment ----------------
export async function initiate(parent: { id: string; email: string }, invoiceId: string, requested?: number, ip?: string) {
  const inv = (await query(
    `select i.id, i.number, i.status, i.student_id,
            coalesce((select sum(amount_kobo) from invoice_lines where invoice_id = i.id), 0)::bigint as total,
            coalesce((select sum(amount_kobo) from payments where invoice_id = i.id and reversed_at is null), 0)::bigint as paid
       from invoices i join parent_students ps on ps.student_id = i.student_id and ps.parent_id = $2 where i.id = $1`, [invoiceId, parent.id])).rows[0];
  if (!inv) throw new AppError(404, 'Invoice not found', 'NOT_FOUND'); // also the answer for someone else's invoice
  if (!onlinePaymentAvailable()) throw new AppError(503, 'Online payment is not set up yet. Please pay at the school office.', 'PAYMENTS_UNAVAILABLE');
  if (inv.status === 'cancelled') throw new AppError(409, 'This invoice has been cancelled.', 'CANCELLED');
  const balance = inv.total - inv.paid;
  if (balance <= 0) throw new AppError(409, 'This invoice is already fully paid.', 'ALREADY_PAID');
  const amount = requested ?? balance;
  if (amount > balance) throw new AppError(400, `That is more than the balance of ${naira(balance)}.`, 'VALIDATION_ERROR', [{ field: 'amountKobo', message: `Cannot be more than ${naira(balance)}` }]);
  if (amount < Math.min(MIN_KOBO, balance)) throw new AppError(400, `The smallest online payment is ${naira(Math.min(MIN_KOBO, balance))}.`, 'VALIDATION_ERROR', [{ field: 'amountKobo', message: `At least ${naira(Math.min(MIN_KOBO, balance))}` }]);
  const open = (await query("select count(*)::int as n from paystack_transactions where invoice_id = $1 and status = 'pending' and created_at > now() - interval '1 hour'", [invoiceId])).rows[0].n as number;
  if (open >= 5) throw new AppError(409, 'You have several unfinished payments for this invoice. Use "Check payment status" before starting another.', 'TOO_MANY_PENDING');

  const reference = `KOK-${inv.number}-${crypto.randomBytes(6).toString('hex')}`; // unguessable and unique
  const data = await paystack('/transaction/initialize', {
    method: 'POST',
    body: { email: parent.email, amount, currency: 'NGN', reference, callback_url: `${env.CLIENT_ORIGIN}/parent/fees/${invoiceId}`, metadata: { invoice_id: invoiceId, invoice_number: inv.number, payer_id: parent.id } },
  });
  if (!data?.authorization_url) throw new AppError(502, 'Paystack did not return a payment page. Nothing was charged.', 'GATEWAY_ERROR');
  await query(
    'insert into paystack_transactions (invoice_id, payer_id, reference, amount_kobo, authorization_url, access_code) values ($1,$2,$3,$4,$5,$6)',
    [invoiceId, parent.id, reference, amount, data.authorization_url, data.access_code ?? null]);
  await audit({ actorId: parent.id, action: 'paystack.initiated', entityType: 'invoice', entityId: invoiceId, metadata: { reference, amountKobo: amount }, ip });
  return { reference, authorizationUrl: data.authorization_url as string, amountKobo: amount };
}

// ---------------- counting a confirmed payment (the only place money is added) ----------------
type Confirmed = { status: string; amount: number; currency: string; reference: string; gateway_response?: string; channel?: string; paid_at?: string };
export type Outcome = 'applied' | 'already_applied' | 'pending' | 'failed' | 'abandoned' | 'mismatch' | 'unknown' | 'invoice_cancelled';

export async function settle(reference: string, d: Confirmed): Promise<{ outcome: Outcome; paymentId?: string }> {
  const result = await withTransaction(async (c) => {
    const txn = (await c.query('select * from paystack_transactions where reference = $1 for update', [reference])).rows[0];
    if (!txn) return { outcome: 'unknown' as Outcome };
    if (txn.payment_id) return { outcome: 'already_applied' as Outcome, paymentId: txn.payment_id as string }; // the lock makes a second attempt wait, then land here

    if (d.status !== 'success') {
      const next = d.status === 'failed' ? 'failed' : d.status === 'abandoned' ? 'abandoned' : 'pending';
      if (next !== 'pending') await c.query('update paystack_transactions set status = $2, gateway_response = $3, verified_at = now() where id = $1', [txn.id, next, d.gateway_response ?? null]);
      return { outcome: next as Outcome };
    }
    // Paystack says it succeeded. Check it is exactly the payment we asked for before counting a single kobo.
    if (d.reference !== reference || d.currency !== 'NGN' || Number(d.amount) !== Number(txn.amount_kobo)) {
      const note = `Paystack reported ${d.currency} ${d.amount} for a payment we started as NGN ${txn.amount_kobo}. Nothing was counted. Check the transaction in your Paystack dashboard.`;
      await c.query("update paystack_transactions set status = 'failed', review_note = $2, gateway_response = $3, verified_at = now() where id = $1", [txn.id, note, d.gateway_response ?? null]);
      await audit({ actorId: null, action: 'paystack.mismatch', entityType: 'invoice', entityId: txn.invoice_id, metadata: { reference, reported: { amount: d.amount, currency: d.currency } } }, c);
      return { outcome: 'mismatch' as Outcome };
    }
    const inv = (await c.query('select * from invoices where id = $1 for update', [txn.invoice_id])).rows[0];
    if (inv.status === 'cancelled') {
      await c.query("update paystack_transactions set status = 'success', review_note = $2, verified_at = now(), paid_at = now() where id = $1",
        [txn.id, 'The invoice was cancelled before this payment arrived. The money was taken, so refund the parent from your Paystack dashboard.']);
      return { outcome: 'invoice_cancelled' as Outcome };
    }
    const t = (await c.query(
      `select coalesce((select sum(amount_kobo) from invoice_lines where invoice_id = $1), 0)::bigint as total,
              coalesce((select sum(amount_kobo) from payments where invoice_id = $1 and reversed_at is null), 0)::bigint as paid`, [txn.invoice_id])).rows[0];
    const over = Number(txn.amount_kobo) - (t.total - t.paid);
    const note = over > 0 ? `Overpaid by ${naira(over)}: the balance was reduced (for example by an office payment) while this payment was in progress. Refund or credit the difference.` : null;
    // The payment is real money, so it is always recorded in full; any excess is flagged for the administrator.
    const pay = await c.query(
      `insert into payments (invoice_id, amount_kobo, method, reference, paid_at, note) values ($1,$2,'paystack',$3,coalesce($4::timestamptz, now()),$5) returning id`,
      [txn.invoice_id, txn.amount_kobo, reference, d.paid_at ?? null, d.channel ? `Paid online (${d.channel})` : 'Paid online']);
    await c.query("update paystack_transactions set status = 'success', payment_id = $2, review_note = $3, channel = $4, gateway_response = $5, paid_at = coalesce($6::timestamptz, now()), verified_at = now() where id = $1",
      [txn.id, pay.rows[0].id, note, d.channel ?? null, d.gateway_response ?? null, d.paid_at ?? null]);
    await audit({ actorId: null, action: 'payment.recorded_online', entityType: 'invoice', entityId: txn.invoice_id, metadata: { paymentId: pay.rows[0].id, reference, amountKobo: txn.amount_kobo, overpaid: over > 0 ? over : 0 } }, c);
    return { outcome: 'applied' as Outcome, paymentId: pay.rows[0].id as string };
  });
  if (result.outcome === 'applied' && result.paymentId) await notifyPaymentReceived(result.paymentId);
  return result;
}

// Ask Paystack directly what happened to a payment (never trust the browser's word for it).
export async function verifyWithPaystack(reference: string) {
  const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  return settle(reference, { status: data.status, amount: data.amount, currency: data.currency, reference: data.reference, gateway_response: data.gateway_response, channel: data.channel, paid_at: data.paid_at });
}

export async function verifyForParent(parentId: string, reference: string) {
  const txn = (await query('select * from paystack_transactions where reference = $1 and payer_id = $2', [reference, parentId])).rows[0];
  if (!txn) throw new AppError(404, 'Payment not found', 'NOT_FOUND');
  const r = txn.payment_id ? { outcome: 'already_applied' as Outcome, paymentId: txn.payment_id } : await verifyWithPaystack(reference);
  const now = (await query('select status, review_note from paystack_transactions where reference = $1', [reference])).rows[0];
  return { outcome: r.outcome, status: now.status as string, invoiceId: txn.invoice_id as string, paymentId: r.paymentId ?? null };
}

// ---------------- webhook ----------------
export async function handleWebhook(raw: Buffer, signature: string | undefined): Promise<{ code: number; body: string }> {
  if (!env.PAYSTACK_SECRET_KEY) return { code: 503, body: 'not configured' };
  const expected = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(raw).digest();
  const given = Buffer.from(signature ?? '', 'hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { code: 401, body: 'bad signature' };

  let body: any;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return { code: 400, body: 'bad json' }; }
  const event = String(body?.event ?? ''); const d = body?.data ?? {};
  const reference = (d.reference ?? d.transaction_reference ?? null) as string | null;
  const dup = reference ? (await query('select 1 from paystack_events where event = $1 and reference = $2 limit 1', [event, reference])).rowCount : 0;
  const summary = { id: d.id, status: d.status, amount: d.amount, currency: d.currency, channel: d.channel, gateway_response: d.gateway_response, paid_at: d.paid_at };
  const ev = (await query('insert into paystack_events (event, reference, summary, duplicate) values ($1,$2,$3,$4) returning id', [event, reference, JSON.stringify(summary), !!dup])).rows[0];

  let result = 'ignored';
  if (event === 'charge.success' && reference) {
    const r = await settle(reference, { status: 'success', amount: d.amount, currency: d.currency, reference: d.reference, gateway_response: d.gateway_response, channel: d.channel, paid_at: d.paid_at });
    result = r.outcome;
  } else if (reference && (event.startsWith('charge.dispute') || event.startsWith('refund.'))) {
    const note = event.startsWith('refund.') ? `Paystack reported a refund (${event}). If money went back to the parent, reverse the payment on the invoice.` : `Paystack reported a dispute (${event}). Respond in your Paystack dashboard.`;
    await query('update paystack_transactions set review_note = $2 where reference = $1', [reference, note]);
    result = 'flagged';
  }
  await query('update paystack_events set result = $2 where id = $1', [ev.id, result]);
  return { code: 200, body: 'ok' };
}

// ---------------- administrator: reconciliation ----------------
export async function listTransactions(f: { status?: string; needsReview: boolean; page: number; pageSize: number }) {
  const where = `($1::text is null or t.status = $1) and (not $2::boolean or t.review_note is not null or t.status in ('failed') or (t.status = 'pending' and t.created_at < now() - interval '30 minutes'))`;
  const total = (await query(`select count(*)::int as n from paystack_transactions t where ${where}`, [f.status ?? null, f.needsReview])).rows[0].n as number;
  const { rows } = await query(
    `select t.*, i.number as invoice_number, p.first_name as pf, p.last_name as pl, s.first_name as sf, s.last_name as sl, pay.receipt_number
       from paystack_transactions t join invoices i on i.id = t.invoice_id join users p on p.id = t.payer_id join users s on s.id = i.student_id
       left join payments pay on pay.id = t.payment_id where ${where}
      order by t.created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, [f.status ?? null, f.needsReview]);
  return {
    total, page: f.page, pageSize: f.pageSize,
    items: rows.map((r) => ({
      id: r.id, reference: r.reference, invoiceId: r.invoice_id, invoiceNumber: r.invoice_number, studentName: `${r.sf} ${r.sl}`, payerName: `${r.pf} ${r.pl}`,
      amountKobo: r.amount_kobo, status: r.status, reviewNote: r.review_note, gatewayResponse: r.gateway_response, receiptNumber: r.receipt_number,
      createdAt: r.created_at, paidAt: r.paid_at,
    })),
  };
}

// For a payment whose webhook never arrived and whose parent never came back.
export async function recheck(id: string, actorId: string, ip?: string) {
  const txn = (await query('select reference, payment_id from paystack_transactions where id = $1', [id])).rows[0];
  if (!txn) throw new AppError(404, 'Transaction not found', 'NOT_FOUND');
  const r = txn.payment_id ? { outcome: 'already_applied' as Outcome } : await verifyWithPaystack(txn.reference);
  await audit({ actorId, action: 'paystack.rechecked', entityType: 'paystack_transaction', entityId: id, metadata: { outcome: r.outcome }, ip });
  return { outcome: r.outcome };
}

export { pool, invoiceStatus };
