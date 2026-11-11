import { query } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { nairaText, toCsv } from '../../utils/csv';
import * as fees from './fees.service';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const fmt = (d: unknown) => (d ? new Date(d as string).toLocaleString('en-CA', { timeZone: 'Africa/Lagos', hour12: false }).replace(',', '') : '');

export async function summaryCsv(termId: string) {
  const r = await fees.report(termId);
  return toCsv([
    ['Class', 'Invoices', 'Billed (NGN)', 'Collected (NGN)', 'Outstanding (NGN)', 'Students owing', 'Students overdue'],
    ...r.byClass.map((c) => [c.className, c.invoices, nairaText(c.billedKobo), nairaText(c.collectedKobo), nairaText(c.outstandingKobo), c.studentsOwing, c.studentsOverdue]),
    ['All classes', r.invoices, nairaText(r.billedKobo), nairaText(r.collectedKobo), nairaText(r.outstandingKobo), r.studentsOwing, r.studentsOverdue],
  ]);
}

export async function invoicesCsv(f: { termId?: string; classId?: string; status?: string }) {
  const all = await fees.listInvoices({ ...f, page: 1, pageSize: 100000 });
  return toCsv([
    ['Invoice', 'Student', 'Admission number', 'Class', 'Term', 'Session', 'Status', 'Due date', 'Total (NGN)', 'Paid (NGN)', 'Balance (NGN)', 'Overdue'],
    ...all.items.map((i: any) => [i.number, i.studentName, i.admissionNumber, i.className, i.termName, i.sessionName, i.status === 'cancelled' ? 'cancelled' : i.balanceKobo <= 0 ? 'paid' : i.paidKobo > 0 ? 'part paid' : 'unpaid',
      i.dueDate, nairaText(i.totalKobo), nairaText(i.paidKobo), nairaText(i.balanceKobo), i.overdue ? 'yes' : 'no']),
  ]);
}

export async function paymentsCsv(termId: string) {
  if (!(await query('select 1 from terms where id = $1', [termId])).rowCount) throw new AppError(404, 'Term not found', 'NOT_FOUND');
  const { rows } = await query(
    `select p.receipt_number, p.paid_at, p.amount_kobo, p.method, p.reference, p.note, p.reversed_at, p.reverse_reason, i.number as invoice,
            u.first_name || ' ' || u.last_name as student, sp.admission_number, ${CLASS_NAME} as class_name
       from payments p join invoices i on i.id = p.invoice_id join users u on u.id = i.student_id left join student_profiles sp on sp.user_id = u.id
       join classes c on c.id = i.class_id where i.term_id = $1 order by p.paid_at, p.receipt_number`, [termId]);
  return toCsv([
    ['Receipt', 'Paid at (Lagos)', 'Invoice', 'Student', 'Admission number', 'Class', 'Method', 'Reference', 'Amount (NGN)', 'Status', 'Reversal reason', 'Note'],
    ...rows.map((p) => [p.receipt_number, fmt(p.paid_at), p.invoice, p.student, p.admission_number, p.class_name, p.method.replace('_', ' '), p.reference, nairaText(p.amount_kobo),
      p.reversed_at ? 'reversed' : 'counted', p.reverse_reason, p.note]),
  ]);
}
