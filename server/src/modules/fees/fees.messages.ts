import { env } from '../../config/env';
import { pool, query } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { naira } from '../../utils/money';
import { fmtLagos } from '../../utils/dates';
import { audit } from '../../services/audit';
import { sendMail } from '../../services/mailer';
import { notifyOne, safely } from '../notifications/notifications.service';
import { invoiceRow, invoiceSelect, TERM_NAMES } from './fees.service';

type Parent = { id: string; email: string; first_name: string };

async function guardiansOf(studentId: string): Promise<Parent[]> {
  const { rows } = await query(
    'select u.id, u.email, u.first_name from parent_students ps join users u on u.id = ps.parent_id where ps.student_id = $1 and u.status = \'active\'', [studentId]);
  return rows;
}

// Sends one email and writes down what the provider actually said. "accepted" is not "delivered".
async function emailAndRecord(notificationId: string, to: string, subject: string, text: string) {
  const r = await sendMail({ to, subject, text });
  const status = r.accepted ? 'accepted' : r.reason === 'no_provider' ? 'not_sent' : 'failed';
  await query('insert into notification_deliveries (notification_id, channel, status, detail) values ($1,$2,$3,$4)', [notificationId, 'email', status, r.id ?? r.reason ?? null]);
  return status as 'accepted' | 'not_sent' | 'failed';
}

const feesLink = (invoiceId: string) => `/parent/fees/${invoiceId}`;
const lagosDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

// ---- tuition reminders: only to the guardians an administrator has linked to the student ----
export async function sendReminders(
  i: { invoiceIds?: string[]; termId?: string; classId?: string; message?: string }, actorId: string, ip?: string,
) {
  const { rows } = await query(
    `select * from (${invoiceSelect}) x where x.status = 'open' and x.total_kobo - x.paid_kobo > 0
       and ($1::uuid[] is null or x.id = any($1::uuid[])) and ($2::uuid is null or x.term_id = $2) and ($3::uuid is null or x.class_id = $3)
     order by x.number`, [i.invoiceIds ?? null, i.invoiceIds ? null : i.termId ?? null, i.classId ?? null]);
  if (!rows.length) throw new AppError(409, 'None of these invoices has an outstanding balance, so there is nobody to remind.', 'NOTHING_TO_SEND');

  const out = { invoices: rows.length, noLinkedGuardian: 0, inAppSent: 0, alreadySentToday: 0, emailsAccepted: 0, emailsNotSent: 0, emailsFailed: 0 };
  for (const row of rows) {
    const inv = invoiceRow(row);
    const lines = (await query("select description from invoice_lines where invoice_id = $1 and kind <> 'discount' order by created_at", [inv.id])).rows.map((l) => l.description).join(', ');
    const guardians = await guardiansOf(inv.studentId);
    if (!guardians.length) { out.noLinkedGuardian++; continue; }
    const title = `School fees reminder: ${inv.studentName}`;
    const body =
      `${inv.studentName} (${inv.className}), ${inv.sessionName} ${inv.termName}. Fees: ${lines}. Outstanding balance: ${naira(inv.balanceKobo)}.` +
      `${inv.dueDate ? ` Pay by ${inv.dueDate}.` : ''}${i.message ? ` ${i.message}` : ''}`;
    for (const g of guardians) {
      const id = await notifyOne(pool, g.id, { type: 'fee_reminder', title, body, link: feesLink(inv.id), entityType: 'invoice', entityId: inv.id, dedupeKey: `fee-reminder:${inv.id}:${lagosDay()}` });
      if (!id) { out.alreadySentToday++; continue; } // one reminder per invoice per guardian per day
      out.inAppSent++;
      const status = await emailAndRecord(id, g.email, title,
        `Hello ${g.first_name},\n\n${body}\n\nTo see the invoice and the payment options, sign in here:\n${env.CLIENT_ORIGIN}${feesLink(inv.id)}\n\nKingdom of Knowledge`);
      if (status === 'accepted') out.emailsAccepted++; else if (status === 'not_sent') out.emailsNotSent++; else out.emailsFailed++;
    }
  }
  await audit({ actorId, action: 'fee_reminders.sent', entityType: 'term', entityId: i.termId, metadata: out, ip });
  return out;
}

// ---- payment confirmation to the child's guardians (in-app, plus email) ----
export const notifyPaymentReceived = (paymentId: string) => safely('payment received', async () => {
  const { rows } = await query(
    `select p.id, p.amount_kobo, p.receipt_number, i.id as invoice_id, i.student_id, u.first_name, u.last_name, t.term_number, s.name as session_name
       from payments p join invoices i on i.id = p.invoice_id join users u on u.id = i.student_id join terms t on t.id = i.term_id join academic_sessions s on s.id = t.session_id
      where p.id = $1`, [paymentId]);
  const p = rows[0]; if (!p) return;
  const bal = (await query(
    `select coalesce((select sum(amount_kobo) from invoice_lines where invoice_id = $1), 0)::bigint - coalesce((select sum(amount_kobo) from payments where invoice_id = $1 and reversed_at is null), 0)::bigint as b`, [p.invoice_id])).rows[0].b as number;
  const title = `Payment received: ${p.first_name} ${p.last_name}`;
  const body = `${naira(p.amount_kobo)} was received for ${p.first_name}'s ${p.session_name} ${TERM_NAMES[p.term_number - 1]} fees. Receipt ${p.receipt_number}. ${bal > 0 ? `Balance remaining: ${naira(bal)}.` : 'The invoice is now fully paid.'}`;
  for (const g of await guardiansOf(p.student_id)) {
    const id = await notifyOne(pool, g.id, { type: 'payment_received', title, body, link: feesLink(p.invoice_id), entityType: 'payment', entityId: p.id, dedupeKey: `payment:${p.id}:received` });
    if (id) await emailAndRecord(id, g.email, title, `Hello ${g.first_name},\n\n${body}\n\nKingdom of Knowledge`);
  }
});
