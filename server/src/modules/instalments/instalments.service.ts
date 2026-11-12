import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

const TODAY = `(now() at time zone 'Africa/Lagos')::date`;
const iso = (d: unknown) => (d instanceof Date ? d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : String(d).slice(0, 10));
const notFound = () => new AppError(404, 'Invoice not found', 'NOT_FOUND');

export interface Inst { id?: string; position: number; dueDate: string; amountKobo: number }
export type InstStatus = 'paid' | 'partial' | 'overdue' | 'upcoming';

// Matches money paid to instalments, oldest first. A pure function, so it is the same everywhere and easy to test.
export function allocate(instalments: Inst[], paidKobo: number, today: string) {
  let left = Math.max(paidKobo, 0);
  return instalments.map((i) => {
    const paid = Math.min(left, i.amountKobo); left -= paid;
    const remaining = i.amountKobo - paid;
    const status: InstStatus = remaining === 0 ? 'paid' : i.dueDate < today ? 'overdue' : paid > 0 ? 'partial' : 'upcoming';
    return { ...i, paidKobo: paid, remainingKobo: remaining, status };
  });
}

async function invoiceMoney(invoiceId: string) {
  const r = (await query(
    `select i.id, i.number, i.status, i.student_id, i.term_id,
            coalesce((select sum(amount_kobo) from invoice_lines l where l.invoice_id = i.id), 0)::bigint as total,
            coalesce((select sum(amount_kobo) from payments p where p.invoice_id = i.id and p.reversed_at is null), 0)::bigint as paid,
            ${TODAY}::text as today
       from invoices i where i.id = $1`, [invoiceId])).rows[0];
  if (!r) throw notFound();
  return { id: r.id as string, number: r.number as string, status: r.status as string, studentId: r.student_id as string, total: Number(r.total), paid: Number(r.paid), today: r.today as string };
}

async function planOf(invoiceId: string) {
  const m = await invoiceMoney(invoiceId);
  const rows = (await query('select id, position, due_date, amount_kobo from invoice_instalments where invoice_id = $1 order by position', [invoiceId])).rows;
  const list: Inst[] = rows.map((r) => ({ id: r.id, position: r.position, dueDate: iso(r.due_date), amountKobo: Number(r.amount_kobo) }));
  const sum = list.reduce((n, i) => n + i.amountKobo, 0);
  const items = allocate(list, m.paid, m.today);
  const next = items.find((i) => i.status !== 'paid') ?? null;
  return {
    invoiceId, number: m.number, invoiceOpen: m.status === 'open', totalKobo: m.total, paidKobo: m.paid, outstandingKobo: Math.max(m.total - m.paid, 0),
    hasPlan: list.length > 0,
    // If a charge or discount was added after the plan was made, the plan no longer adds up to the invoice and must be rebuilt.
    outOfDate: list.length > 0 && sum !== m.total, planTotalKobo: sum,
    instalments: items, next: next ? { dueDate: next.dueDate, remainingKobo: next.remainingKobo, status: next.status } : null,
  };
}

export const adminPlan = (invoiceId: string) => planOf(invoiceId);

export async function parentPlan(parentId: string, invoiceId: string) {
  const m = await invoiceMoney(invoiceId).catch(() => null);
  const linked = m && (await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [parentId, m.studentId])).rowCount;
  if (!linked) throw notFound(); // never reveal that another family's invoice exists
  return planOf(invoiceId);
}

// A suggested equal split, with any odd kobo added to the LAST instalment so the parts add up exactly.
export async function suggest(invoiceId: string, count: number, firstDue: string, gapDays: number) {
  const m = await invoiceMoney(invoiceId);
  const remainingToPlan = m.total;
  const base = Math.floor(remainingToPlan / count);
  const out: Inst[] = [];
  const d0 = new Date(`${firstDue}T12:00:00Z`);
  for (let k = 0; k < count; k++) {
    const d = new Date(d0.getTime() + k * gapDays * 864e5);
    out.push({ position: k + 1, dueDate: d.toISOString().slice(0, 10), amountKobo: k === count - 1 ? remainingToPlan - base * (count - 1) : base });
  }
  return { instalments: out, totalKobo: m.total };
}

export async function setPlan(invoiceId: string, items: { dueDate: string; amountKobo: number }[], actorId: string, ip?: string) {
  const m = await invoiceMoney(invoiceId);
  if (m.status !== 'open') throw new AppError(409, 'This invoice is cancelled.', 'INVALID_STATE');
  if (items.length < 2 || items.length > 6) throw new AppError(400, 'A plan has 2 to 6 instalments.', 'VALIDATION_ERROR');
  for (let k = 1; k < items.length; k++) if (items[k].dueDate <= items[k - 1].dueDate) throw new AppError(400, 'Each instalment must be due after the one before it.', 'VALIDATION_ERROR');
  const sum = items.reduce((n, i) => n + i.amountKobo, 0);
  if (sum !== m.total) throw new AppError(400, `The instalments add up to ${(sum / 100).toLocaleString('en-NG')} naira but the invoice is ${(m.total / 100).toLocaleString('en-NG')} naira. They must match exactly.`, 'VALIDATION_ERROR');
  await withTransaction(async (c) => {
    await c.query('delete from invoice_instalments where invoice_id = $1', [invoiceId]);
    for (const [k, i] of items.entries()) await c.query('insert into invoice_instalments (invoice_id, position, due_date, amount_kobo, created_by) values ($1,$2,$3,$4,$5)', [invoiceId, k + 1, i.dueDate, i.amountKobo, actorId]);
    await audit({ actorId, action: 'instalments.set', entityType: 'invoice', entityId: invoiceId, metadata: { count: items.length, totalKobo: sum }, ip }, c);
  });
  return planOf(invoiceId);
}

export async function clearPlan(invoiceId: string, actorId: string, ip?: string) {
  await invoiceMoney(invoiceId);
  await query('delete from invoice_instalments where invoice_id = $1', [invoiceId]);
  await audit({ actorId, action: 'instalments.cleared', entityType: 'invoice', entityId: invoiceId, ip });
  return { cleared: true };
}

// ---- Reminders (run daily by scripts/instalment-reminders.ts) ----
// One reminder when an unpaid instalment is due within 3 days and one when it is overdue, each sent once per instalment.
export async function sendReminders(apply: boolean) {
  const { wants } = await import('../family/preferences.service');
  const invs = (await query(
    `select distinct i.id from invoices i join invoice_instalments x on x.invoice_id = i.id where i.status = 'open'
        and ((x.reminded_soon_at is null and x.due_date <= ${TODAY} + 3) or (x.reminded_overdue_at is null and x.due_date < ${TODAY}))`)).rows;
  const summary = { dueSoon: 0, overdue: 0, parentsNotified: 0 };
  for (const { id } of invs) {
    const plan = await planOf(id);
    const m = await invoiceMoney(id);
    const parents = (await query('select ps.parent_id from parent_students ps join users u on u.id = ps.parent_id and u.status = \'active\' where ps.student_id = $1', [m.studentId])).rows;
    const kid = (await query('select first_name from users where id = $1', [m.studentId])).rows[0];
    const rows = (await query('select id, position, reminded_soon_at, reminded_overdue_at from invoice_instalments where invoice_id = $1', [id])).rows;
    for (const it of plan.instalments) {
      if (it.remainingKobo === 0) continue;
      const row = rows.find((r) => r.position === it.position)!;
      const overdue = it.dueDate < m.today;
      const soon = !overdue && it.dueDate <= new Date(new Date(`${m.today}T12:00:00Z`).getTime() + 3 * 864e5).toISOString().slice(0, 10);
      const stage = overdue && !row.reminded_overdue_at ? 'overdue' : soon && !row.reminded_soon_at ? 'soon' : null;
      if (!stage) continue;
      summary[stage === 'overdue' ? 'overdue' : 'dueSoon']++;
      if (!apply) continue;
      const amount = `₦${(it.remainingKobo / 100).toLocaleString('en-NG')}`;
      const title = stage === 'overdue' ? `Fee instalment overdue for ${kid.first_name}` : `Fee instalment due soon for ${kid.first_name}`;
      const body = `${amount} ${stage === 'overdue' ? 'was due on' : 'is due on'} ${it.dueDate} (invoice ${plan.number}).`;
      for (const p of parents) {
        if (!(await wants(p.parent_id, 'fee_instalment_reminder', 'in_app'))) continue;
        await query(`insert into notifications (user_id, type, title, body, link, entity_type, entity_id) values ($1,'fee_instalment_reminder',$2,$3,$4,'invoice',$5)`, [p.parent_id, title, body, `/parent/fees/${id}`, id]);
        summary.parentsNotified++;
      }
      await query(`update invoice_instalments set ${stage === 'overdue' ? 'reminded_overdue_at' : 'reminded_soon_at'} = now() where id = $1`, [it.id]);
    }
  }
  return summary;
}
