import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { naira } from '../../utils/money';
import { audit } from '../../services/audit';
import { assertRole } from '../academic/academic.service';

type Ctx = { actorId: string; ip?: string };
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
export const TERM_NAMES = ['First Term', 'Second Term', 'Third Term'];

// ---------------- categories and schedule ----------------
const catRow = (r: any) => ({ id: r.id, name: r.name, description: r.description, active: r.active });

export async function listCategories() {
  return (await query('select * from fee_categories order by name')).rows.map(catRow);
}
export async function createCategory(i: { name: string; description: string }, ctx: Ctx) {
  const { rows } = await query('insert into fee_categories (name, description) values ($1,$2) returning *', [i.name, i.description]);
  await audit({ actorId: ctx.actorId, action: 'fee_category.created', entityType: 'fee_category', entityId: rows[0].id, ip: ctx.ip });
  return catRow(rows[0]);
}
export async function updateCategory(id: string, i: { name?: string; description?: string; active?: boolean }, ctx: Ctx) {
  const { rows } = await query(
    'update fee_categories set name = coalesce($2, name), description = coalesce($3, description), active = coalesce($4, active) where id = $1 returning *',
    [id, i.name ?? null, i.description ?? null, i.active ?? null]);
  if (!rows[0]) throw notFound('Fee category');
  await audit({ actorId: ctx.actorId, action: 'fee_category.updated', entityType: 'fee_category', entityId: id, ip: ctx.ip });
  return catRow(rows[0]);
}

export async function getSchedule(termId: string, classId: string) {
  const { rows } = await query(
    `select f.category_id, f.amount_kobo, k.name from fee_schedule_items f join fee_categories k on k.id = f.category_id
      where f.term_id = $1 and f.class_id = $2 order by k.name`, [termId, classId]);
  return { items: rows.map((r) => ({ categoryId: r.category_id, categoryName: r.name, amountKobo: r.amount_kobo })), totalKobo: rows.reduce((s, r) => s + r.amount_kobo, 0) };
}

// Replaces the whole list for one class and term. Invoices that were already generated are not changed.
export async function setSchedule(i: { termId: string; classId: string; items: { categoryId: string; amountKobo: number }[] }, ctx: Ctx) {
  await withTransaction(async (c) => {
    await c.query('delete from fee_schedule_items where term_id = $1 and class_id = $2', [i.termId, i.classId]);
    if (i.items.length) {
      await c.query(
        `insert into fee_schedule_items (term_id, class_id, category_id, amount_kobo)
         select $1, $2, x.category_id, x.amount from unnest($3::uuid[], $4::bigint[]) as x(category_id, amount)`,
        [i.termId, i.classId, i.items.map((x) => x.categoryId), i.items.map((x) => x.amountKobo)]);
    }
    await audit({ actorId: ctx.actorId, action: 'fee_schedule.set', entityType: 'term', entityId: i.termId, metadata: { classId: i.classId, items: i.items }, ip: ctx.ip }, c);
  });
  return getSchedule(i.termId, i.classId);
}

// ---------------- invoices ----------------
const TOTALS = `
  coalesce((select sum(l.amount_kobo) from invoice_lines l where l.invoice_id = i.id), 0)::bigint as total_kobo,
  coalesce((select sum(p.amount_kobo) from payments p where p.invoice_id = i.id and p.reversed_at is null), 0)::bigint as paid_kobo`;
export const invoiceSelect = `
  select i.*, ${TOTALS}, u.first_name, u.last_name, sp.admission_number, ${CLASS_NAME} as class_name,
         t.term_number, s.name as session_name
    from invoices i join users u on u.id = i.student_id left join student_profiles sp on sp.user_id = u.id
    join classes c on c.id = i.class_id join terms t on t.id = i.term_id join academic_sessions s on s.id = t.session_id`;

export function invoiceStatus(r: { status: string; total_kobo: number; paid_kobo: number }) {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.total_kobo - r.paid_kobo <= 0) return 'paid';
  return r.paid_kobo > 0 ? 'part_paid' : 'unpaid';
}
export const invoiceRow = (r: any) => {
  const balance = r.total_kobo - r.paid_kobo;
  const status = invoiceStatus(r);
  return {
    id: r.id, number: r.number, studentId: r.student_id, studentName: `${r.first_name} ${r.last_name}`, admissionNumber: r.admission_number,
    classId: r.class_id, className: r.class_name, termId: r.term_id, termName: TERM_NAMES[r.term_number - 1], sessionName: r.session_name,
    dueDate: r.due_date, status, totalKobo: r.total_kobo, paidKobo: r.paid_kobo, balanceKobo: status === 'cancelled' ? 0 : Math.max(0, balance),
    overdue: status !== 'paid' && status !== 'cancelled' && !!r.due_date && r.due_date < new Date().toISOString().slice(0, 10),
    cancelReason: r.cancel_reason,
  };
};

export async function generateInvoices(i: { termId: string; classId?: string; dueDate?: string }, ctx: Ctx) {
  return withTransaction(async (c) => {
    const term = (await c.query('select id, session_id from terms where id = $1', [i.termId])).rows[0];
    if (!term) throw notFound('Term');
    const classes = (await c.query(
      i.classId ? 'select id from classes where id = $1' : 'select distinct class_id as id from fee_schedule_items where term_id = $1',
      [i.classId ?? i.termId])).rows.map((r) => r.id as string);
    if (i.classId && !classes.length) throw notFound('Class');
    let created = 0, skippedExisting = 0, classesWithoutFees = 0;
    for (const classId of classes) {
      const items = (await c.query(
        `select f.category_id, f.amount_kobo, k.name from fee_schedule_items f join fee_categories k on k.id = f.category_id
          where f.term_id = $1 and f.class_id = $2 and k.active order by k.name`, [i.termId, classId])).rows;
      if (!items.length) { classesWithoutFees++; continue; }
      const students = (await c.query("select student_id from enrolments where class_id = $1 and session_id = $2 and status = 'active'", [classId, term.session_id])).rows;
      for (const s of students) {
        const ins = await c.query(
          `insert into invoices (student_id, term_id, class_id, due_date, created_by) values ($1,$2,$3,$4,$5)
           on conflict (student_id, term_id) do nothing returning id`, [s.student_id, i.termId, classId, i.dueDate ?? null, ctx.actorId]);
        if (!ins.rows[0]) { skippedExisting++; continue; }
        await c.query(
          `insert into invoice_lines (invoice_id, kind, category_id, description, amount_kobo, created_by)
           select $1, 'fee', x.cid, x.name, x.amount, $2 from unnest($3::uuid[], $4::text[], $5::bigint[]) as x(cid, name, amount)`,
          [ins.rows[0].id, ctx.actorId, items.map((x) => x.category_id), items.map((x) => x.name), items.map((x) => x.amount_kobo)]);
        created++;
      }
    }
    await audit({ actorId: ctx.actorId, action: 'invoices.generated', entityType: 'term', entityId: i.termId, metadata: { created, skippedExisting, classId: i.classId }, ip: ctx.ip }, c);
    return { created, skippedExisting, classesWithoutFees };
  });
}

export async function listInvoices(f: { termId?: string; classId?: string; q?: string; status?: string; page: number; pageSize: number }) {
  const params = [f.termId ?? null, f.classId ?? null, f.q ? `%${f.q}%` : null, f.status ?? null];
  const inner = `${invoiceSelect} where ($1::uuid is null or i.term_id = $1) and ($2::uuid is null or i.class_id = $2)
      and ($3::text is null or u.first_name || ' ' || u.last_name ilike $3 or sp.admission_number ilike $3 or i.number ilike $3)`;
  const wrapped = `select * from (${inner}) x where ($4::text is null or case $4
      when 'cancelled' then x.status = 'cancelled'
      when 'paid' then x.status = 'open' and x.total_kobo - x.paid_kobo <= 0
      when 'part_paid' then x.status = 'open' and x.paid_kobo > 0 and x.total_kobo - x.paid_kobo > 0
      when 'unpaid' then x.status = 'open' and x.paid_kobo = 0 and x.total_kobo > 0
      when 'overdue' then x.status = 'open' and x.total_kobo - x.paid_kobo > 0 and x.due_date < current_date end)`;
  const total = (await query(`select count(*)::int as n from (${wrapped}) y`, params)).rows[0].n as number;
  const { rows } = await query(`${wrapped} order by x.created_at desc, x.number limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return { items: rows.map(invoiceRow), page: f.page, pageSize: f.pageSize, total };
}

export async function getInvoice(id: string, db: Queryable = pool) {
  const { rows } = await db.query(`${invoiceSelect} where i.id = $1`, [id]);
  if (!rows[0]) throw notFound('Invoice');
  const lines = (await db.query('select id, kind, description, amount_kobo, reason, created_at from invoice_lines where invoice_id = $1 order by created_at, id', [id])).rows;
  const pays = (await db.query(
    `select p.id, p.receipt_number, p.amount_kobo, p.method, p.reference, p.note, p.paid_at, p.reversed_at, p.reverse_reason
       from payments p where p.invoice_id = $1 order by p.paid_at, p.created_at`, [id])).rows;
  const parents = (await db.query(
    `select u.id, u.first_name, u.last_name, u.email, ps.relationship from parent_students ps join users u on u.id = ps.parent_id where ps.student_id = $1 order by ps.is_primary desc, u.first_name`, [rows[0].student_id])).rows;
  return {
    ...invoiceRow(rows[0]),
    lines: lines.map((l) => ({ id: l.id, kind: l.kind, description: l.description, amountKobo: l.amount_kobo, reason: l.reason, createdAt: l.created_at })),
    payments: pays.map((p) => ({ id: p.id, receiptNumber: p.receipt_number, amountKobo: p.amount_kobo, method: p.method, reference: p.reference, note: p.note, paidAt: p.paid_at, reversed: !!p.reversed_at, reverseReason: p.reverse_reason })),
    guardians: parents.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, email: p.email, relationship: p.relationship })),
  };
}

async function lockOpenInvoice(c: Queryable, id: string) {
  const inv = (await c.query('select * from invoices where id = $1 for update', [id])).rows[0];
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'cancelled') throw new AppError(409, 'This invoice has been cancelled.', 'CANCELLED');
  const t = (await c.query(
    `select coalesce((select sum(amount_kobo) from invoice_lines where invoice_id = $1), 0)::bigint as total,
            coalesce((select sum(amount_kobo) from payments where invoice_id = $1 and reversed_at is null), 0)::bigint as paid`, [id])).rows[0];
  return { inv, total: t.total as number, paid: t.paid as number };
}

// A charge raises the invoice; a discount lowers it, but never below what has already been paid.
export async function addLine(id: string, i: { kind: 'charge' | 'discount'; description: string; amountKobo: number; reason: string }, ctx: Ctx) {
  await withTransaction(async (c) => {
    const { total, paid } = await lockOpenInvoice(c, id);
    const signed = i.kind === 'discount' ? -i.amountKobo : i.amountKobo;
    if (total + signed < paid) {
      throw new AppError(409, `A discount of ${naira(i.amountKobo)} would take the invoice below the ${naira(paid)} already paid. Reverse or refund a payment first.`, 'BELOW_PAID');
    }
    const ins = await c.query(
      'insert into invoice_lines (invoice_id, kind, description, amount_kobo, reason, created_by) values ($1,$2,$3,$4,$5,$6) returning id',
      [id, i.kind, i.description, signed, i.reason, ctx.actorId]);
    await audit({ actorId: ctx.actorId, action: `invoice.${i.kind}_added`, entityType: 'invoice', entityId: id, metadata: { lineId: ins.rows[0].id, amountKobo: signed, description: i.description, reason: i.reason }, ip: ctx.ip }, c);
  });
  return getInvoice(id);
}

export async function setDueDate(id: string, dueDate: string | null, ctx: Ctx) {
  const { rowCount } = await query("update invoices set due_date = $2 where id = $1 and status = 'open'", [id, dueDate]);
  if (!rowCount) throw notFound('Open invoice');
  await audit({ actorId: ctx.actorId, action: 'invoice.due_date_set', entityType: 'invoice', entityId: id, metadata: { dueDate }, ip: ctx.ip });
  return getInvoice(id);
}

export async function cancelInvoice(id: string, reason: string, ctx: Ctx) {
  await withTransaction(async (c) => {
    const { paid } = await lockOpenInvoice(c, id);
    if (paid > 0) throw new AppError(409, 'This invoice has payments recorded. Reverse them first if the invoice was raised by mistake.', 'HAS_PAYMENTS');
    await c.query("update invoices set status = 'cancelled', cancel_reason = $2 where id = $1", [id, reason]);
    await audit({ actorId: ctx.actorId, action: 'invoice.cancelled', entityType: 'invoice', entityId: id, metadata: { reason }, ip: ctx.ip }, c);
  });
  return getInvoice(id);
}

// ---------------- payments ----------------
export async function recordPayment(
  id: string, i: { amountKobo: number; method: string; reference?: string; note?: string; paidAt?: string }, ctx: Ctx,
) {
  const paymentId = await withTransaction(async (c) => {
    const { total, paid } = await lockOpenInvoice(c, id); // the row lock makes two simultaneous payments queue up
    const balance = total - paid;
    if (balance <= 0) throw new AppError(409, 'This invoice is already fully paid.', 'ALREADY_PAID');
    if (i.amountKobo > balance) throw new AppError(409, `That is more than the outstanding balance of ${naira(balance)}.`, 'OVERPAYMENT', [{ field: 'amountKobo', message: `Cannot be more than ${naira(balance)}` }]);
    if (i.paidAt && new Date(i.paidAt) > new Date(Date.now() + 5 * 60_000)) throw new AppError(400, 'The payment date cannot be in the future.', 'VALIDATION_ERROR', [{ field: 'paidAt', message: 'Cannot be in the future' }]);
    const ins = await c.query(
      `insert into payments (invoice_id, amount_kobo, method, reference, note, paid_at, recorded_by) values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7) returning id`,
      [id, i.amountKobo, i.method, i.reference || null, i.note || null, i.paidAt ?? null, ctx.actorId]);
    await audit({ actorId: ctx.actorId, action: 'payment.recorded', entityType: 'invoice', entityId: id, metadata: { paymentId: ins.rows[0].id, amountKobo: i.amountKobo, method: i.method, reference: i.reference }, ip: ctx.ip }, c);
    return ins.rows[0].id as string;
  });
  return { paymentId, invoice: await getInvoice(id) };
}

export async function reversePayment(paymentId: string, reason: string, ctx: Ctx) {
  const invoiceId = await withTransaction(async (c) => {
    const p = (await c.query('select * from payments where id = $1 for update', [paymentId])).rows[0];
    if (!p) throw notFound('Payment');
    if (p.reversed_at) throw new AppError(409, 'This payment has already been reversed.', 'ALREADY_REVERSED');
    await c.query('update payments set reversed_at = now(), reversed_by = $2, reverse_reason = $3 where id = $1', [paymentId, ctx.actorId, reason]);
    await audit({ actorId: ctx.actorId, action: 'payment.reversed', entityType: 'invoice', entityId: p.invoice_id, metadata: { paymentId, amountKobo: p.amount_kobo, reason }, ip: ctx.ip }, c);
    return p.invoice_id as string;
  });
  return getInvoice(invoiceId);
}

// A receipt is the plain facts of one payment. Whether the caller may see it is decided in the route.
export async function getReceipt(paymentId: string) {
  const { rows } = await query(
    `select p.*, i.number as invoice_number, i.student_id, u.first_name, u.last_name, sp.admission_number, ${CLASS_NAME} as class_name,
            t.term_number, s.name as session_name
       from payments p join invoices i on i.id = p.invoice_id join users u on u.id = i.student_id left join student_profiles sp on sp.user_id = u.id
       join classes c on c.id = i.class_id join terms t on t.id = i.term_id join academic_sessions s on s.id = t.session_id where p.id = $1`, [paymentId]);
  const p = rows[0];
  if (!p) throw notFound('Receipt');
  const t = (await query(
    `select coalesce((select sum(amount_kobo) from invoice_lines where invoice_id = $1), 0)::bigint as total,
            coalesce((select sum(amount_kobo) from payments where invoice_id = $1 and reversed_at is null), 0)::bigint as paid`, [p.invoice_id])).rows[0];
  return {
    id: p.id, receiptNumber: p.receipt_number, invoiceId: p.invoice_id, invoiceNumber: p.invoice_number, studentId: p.student_id,
    studentName: `${p.first_name} ${p.last_name}`, admissionNumber: p.admission_number, className: p.class_name,
    termName: TERM_NAMES[p.term_number - 1], sessionName: p.session_name, amountKobo: p.amount_kobo, method: p.method, reference: p.reference,
    paidAt: p.paid_at, reversed: !!p.reversed_at, balanceKobo: Math.max(0, t.total - t.paid), invoiceTotalKobo: t.total,
  };
}

// ---------------- report ----------------
export async function report(termId: string) {
  const term = (await query('select t.id, t.term_number, s.name from terms t join academic_sessions s on s.id = t.session_id where t.id = $1', [termId])).rows[0];
  if (!term) throw notFound('Term');
  const { rows } = await query(
    `select c.id as class_id, ${CLASS_NAME} as class_name, count(*)::int as invoices,
            sum(x.total_kobo)::bigint as billed, sum(x.paid_kobo)::bigint as collected,
            count(*) filter (where x.total_kobo - x.paid_kobo > 0)::int as owing,
            count(*) filter (where x.total_kobo - x.paid_kobo > 0 and x.due_date < current_date)::int as overdue
       from (select i.class_id, i.due_date, ${TOTALS} from invoices i where i.term_id = $1 and i.status = 'open') x
       join classes c on c.id = x.class_id group by c.id order by c.stage desc, c.year, c.arm nulls first`, [termId]);
  const byClass = rows.map((r) => ({ classId: r.class_id, className: r.class_name, invoices: r.invoices, billedKobo: r.billed, collectedKobo: r.collected, outstandingKobo: Math.max(0, r.billed - r.collected), studentsOwing: r.owing, studentsOverdue: r.overdue }));
  const sum = (k: 'billedKobo' | 'collectedKobo') => byClass.reduce((s, r) => s + r[k], 0);
  return {
    term: `${term.name} ${TERM_NAMES[term.term_number - 1]}`,
    billedKobo: sum('billedKobo'), collectedKobo: sum('collectedKobo'), outstandingKobo: byClass.reduce((s, r) => s + r.outstandingKobo, 0),
    invoices: byClass.reduce((s, r) => s + r.invoices, 0), studentsOwing: byClass.reduce((s, r) => s + r.studentsOwing, 0),
    studentsOverdue: byClass.reduce((s, r) => s + r.studentsOverdue, 0), byClass,
  };
}

export { assertRole };
