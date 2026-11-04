import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { InvoiceStatus, METHOD_LABEL } from '../../components/FeeBits';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime, naira, toKobo } from '../../lib/format';
import type { InvoiceDetail } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';
import { ReminderSummary, type ReminderResult } from './Invoices';

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const inv = useFetch<InvoiceDetail>(`/fees/invoices/${id}`);
  const d = inv.data;

  const pay = useAction(); const [pf, setPf] = useState({ amount: '', method: 'cash', reference: '', note: '' }); const [paid, setPaid] = useState('');
  const line = useAction(); const [lf, setLf] = useState({ kind: 'discount', description: '', amount: '', reason: '' });
  const rev = useAction(); const [revId, setRevId] = useState(''); const [revReason, setRevReason] = useState('');
  const cancel = useAction(); const [cancelling, setCancelling] = useState(false); const [cancelReason, setCancelReason] = useState('');
  const rem = useAction(); const [remResult, setRemResult] = useState<ReminderResult | null>(null);
  const due = useAction(); const [dueDate, setDueDate] = useState('');

  async function recordPayment(e: FormEvent) {
    e.preventDefault(); setPaid('');
    const kobo = toKobo(pf.amount);
    if (kobo === null || kobo <= 0) return; // the button is disabled for these, this is only a safety net
    if (await pay.run(() => api(`/fees/invoices/${id}/payments`, { body: { amountKobo: kobo, method: pf.method, ...(pf.reference.trim() ? { reference: pf.reference.trim() } : {}), ...(pf.note.trim() ? { note: pf.note.trim() } : {}) } }))) {
      setPaid(`Payment of ${naira(kobo)} recorded. The parent has been notified.`); setPf({ amount: '', method: pf.method, reference: '', note: '' }); inv.reload();
    }
  }
  async function addLine(e: FormEvent) {
    e.preventDefault();
    const kobo = toKobo(lf.amount); if (kobo === null || kobo <= 0) return;
    if (await line.run(() => api(`/fees/invoices/${id}/lines`, { body: { kind: lf.kind, description: lf.description, amountKobo: kobo, reason: lf.reason } }))) { setLf({ ...lf, description: '', amount: '', reason: '' }); inv.reload(); }
  }
  async function reverse() { setPaid(''); if (await rev.run(() => api(`/fees/payments/${revId}/reverse`, { body: { reason: revReason } }))) { setRevId(''); setRevReason(''); inv.reload(); } }
  async function doCancel() { if (await cancel.run(() => api(`/fees/invoices/${id}/cancel`, { body: { reason: cancelReason } }))) { setCancelling(false); inv.reload(); } }
  async function remind() { setRemResult(null); let r: ReminderResult | undefined; if (await rem.run(async () => { r = await api<ReminderResult>('/fees/reminders', { body: { invoiceIds: [id] } }); })) setRemResult(r!); }
  async function saveDue() { if (await due.run(() => api(`/fees/invoices/${id}/due-date`, { method: 'PATCH', body: { dueDate: dueDate || null } }))) inv.reload(); }

  const amountBad = pf.amount.trim() !== '' && toKobo(pf.amount) === null;
  const closed = d?.status === 'cancelled';
  return (
    <>
      <p className="mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/admin/invoices">All invoices</Link></p>
      <DataState loading={inv.loading && !d} error={inv.error}>
        {d && (
          <>
            <PageHeader title={`${d.number} · ${d.studentName}`} intro={`${d.className} · ${d.sessionName} ${d.termName}${d.dueDate ? ` · pay by ${fmtDate(d.dueDate)}` : ''}`} />
            <div className="mb-6 flex flex-wrap items-center gap-3"><InvoiceStatus i={d} />
              <span className="text-sm text-muted">Total {naira(d.totalKobo)} · Paid {naira(d.paidKobo)} · <span className="font-semibold text-ink">Balance {naira(d.balanceKobo)}</span></span>
              {!closed && d.balanceKobo > 0 && <SmallButton onClick={remind} disabled={rem.busy}>Remind parent</SmallButton>}
            </div>
            {closed && <div className="mb-6"><Alert tone="error">This invoice was cancelled{d.cancelReason ? `: ${d.cancelReason}` : ''}.</Alert></div>}
            {rem.error && <div className="mb-4"><Alert tone="error">{rem.error}</Alert></div>}
            {remResult && <div className="mb-4"><ReminderSummary r={remResult} /></div>}

            <div className="grid gap-6 2xl:grid-cols-2">
              <Card title="What is being charged">
                <Table><thead><tr><Th>Item</Th><Th>Amount</Th></tr></thead>
                  <tbody>{d.lines.map((l) => (
                    <tr key={l.id}><Td>{l.description}{l.kind !== 'fee' && <> <Badge tone={l.kind === 'discount' ? 'good' : 'warn'}>{l.kind === 'discount' ? 'Discount' : 'Extra charge'}</Badge></>}{l.reason && <div className="text-muted">{l.reason}</div>}</Td>
                      <Td className={l.amountKobo < 0 ? 'text-brand-700' : ''}>{l.amountKobo < 0 ? '-' : ''}{naira(Math.abs(l.amountKobo))}</Td></tr>))}
                    <tr><Td className="font-semibold">Total</Td><Td className="font-semibold">{naira(d.totalKobo)}</Td></tr></tbody></Table>
                {!closed && (
                  <form onSubmit={addLine} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" noValidate>
                    <p className="font-medium sm:col-span-2">Add a discount or extra charge</p>
                    <Select label="Type" value={lf.kind} onChange={(e) => setLf({ ...lf, kind: e.target.value })}><option value="discount">Discount</option><option value="charge">Extra charge</option></Select>
                    <Field label="Amount (₦)" inputMode="decimal" value={lf.amount} error={lf.amount && toKobo(lf.amount) === null ? 'Enter an amount like 5000' : line.fields.amountKobo} onChange={(e) => setLf({ ...lf, amount: e.target.value })} />
                    <Field label="Description" value={lf.description} error={line.fields.description} onChange={(e) => setLf({ ...lf, description: e.target.value })} />
                    <Field label="Reason (kept on record)" value={lf.reason} error={line.fields.reason} onChange={(e) => setLf({ ...lf, reason: e.target.value })} />
                    <div className="sm:col-span-2">{line.error && !Object.keys(line.fields).length && <div className="mb-3"><Alert tone="error">{line.error}</Alert></div>}<div className="max-w-xs"><Button type="submit" loading={line.busy}>Add to invoice</Button></div></div>
                  </form>
                )}
              </Card>

              <Card title="Payments">
                {d.payments.length ? (
                  <Table><thead><tr><Th>Date</Th><Th>Amount</Th><Th>How</Th><Th /></tr></thead>
                    <tbody>{d.payments.map((p) => (
                      <tr key={p.id} className={p.reversed ? 'text-muted line-through' : ''}>
                        <Td>{fmtDateTime(p.paidAt)}<div className="text-muted no-underline">{p.receiptNumber}</div></Td>
                        <Td>{naira(p.amountKobo)}</Td>
                        <Td>{METHOD_LABEL[p.method]}{p.reference && <div className="text-muted">{p.reference}</div>}{p.reversed && <div>Reversed: {p.reverseReason}</div>}</Td>
                        <Td className="whitespace-nowrap text-right no-underline">
                          {!p.reversed && <Link className="mr-3 font-medium text-brand-700 underline" to={`/admin/receipts/${p.id}`}>Receipt</Link>}
                          {!p.reversed && p.method !== 'paystack' && <SmallButton tone="danger" onClick={() => { setRevId(p.id); setRevReason(''); }}>Reverse</SmallButton>}
                        </Td>
                      </tr>))}</tbody></Table>
                ) : <Empty>No payments recorded yet.</Empty>}
                {revId && (
                  <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="font-medium">Reverse this payment?</p>
                    <Field label="Reason (kept on record)" value={revReason} onChange={(e) => setRevReason(e.target.value)} />
                    {rev.error && <Alert tone="error">{rev.error}</Alert>}
                    <div className="flex gap-3"><SmallButton tone="danger" onClick={reverse} disabled={rev.busy || revReason.trim().length < 3}>Reverse payment</SmallButton><SmallButton onClick={() => setRevId('')}>Keep it</SmallButton></div>
                  </div>
                )}
                {!closed && d.balanceKobo > 0 && (
                  <form onSubmit={recordPayment} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" noValidate>
                    <p className="font-medium sm:col-span-2">Record a payment received</p>
                    <Field label="Amount (₦)" inputMode="decimal" placeholder={nairaPlaceholder(d.balanceKobo)} value={pf.amount} error={amountBad ? 'Enter an amount like 50000 or 50000.50' : pay.fields.amountKobo} onChange={(e) => setPf({ ...pf, amount: e.target.value })} />
                    <Select label="How was it paid?" value={pf.method} onChange={(e) => setPf({ ...pf, method: e.target.value })}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option><option value="other">Other</option></Select>
                    <Field label="Reference (optional)" hint="Transfer or teller number" value={pf.reference} onChange={(e) => setPf({ ...pf, reference: e.target.value })} />
                    <Field label="Note (optional)" value={pf.note} onChange={(e) => setPf({ ...pf, note: e.target.value })} />
                    <div className="sm:col-span-2">
                      {pay.error && !pay.fields.amountKobo && <div className="mb-3"><Alert tone="error">{pay.error}</Alert></div>}
                      {paid && <div className="mb-3"><Alert tone="success">{paid}</Alert></div>}
                      <div className="max-w-xs"><Button type="submit" loading={pay.busy} disabled={!pf.amount || amountBad}>Record payment</Button></div>
                    </div>
                  </form>
                )}
              </Card>
            </div>

            {!closed && (
              <div className="mt-6 grid gap-6 2xl:grid-cols-2">
                <Card title="Payment deadline">
                  <div className="flex flex-wrap items-end gap-3"><div className="w-48"><Field label="Pay by" type="date" value={dueDate || d.dueDate || ''} onChange={(e) => setDueDate(e.target.value)} /></div><SmallButton onClick={saveDue} disabled={due.busy}>Save deadline</SmallButton></div>
                  {due.error && <div className="mt-3"><Alert tone="error">{due.error}</Alert></div>}
                </Card>
                {d.paidKobo === 0 && (
                  <Card title="Cancel this invoice">
                    {cancelling ? (
                      <div className="space-y-3"><Field label="Reason (kept on record)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                        {cancel.error && <Alert tone="error">{cancel.error}</Alert>}
                        <div className="flex gap-3"><SmallButton tone="danger" onClick={doCancel} disabled={cancel.busy || cancelReason.trim().length < 3}>Cancel invoice</SmallButton><SmallButton onClick={() => setCancelling(false)}>Keep it</SmallButton></div></div>
                    ) : (<><p className="mb-3 text-sm text-muted">Use this if the invoice was raised by mistake or the student has left. It cannot take payments afterwards.</p><SmallButton tone="danger" onClick={() => setCancelling(true)}>Cancel invoice…</SmallButton></>)}
                  </Card>
                )}
              </div>
            )}
            {d.guardians && (
              <div className="mt-6"><Card title="Guardians who will be notified">
                {d.guardians.length ? <ul className="text-sm">{d.guardians.map((g) => <li key={g.id}>{g.name} <span className="capitalize text-muted">({g.relationship})</span> · {g.email}</li>)}</ul>
                  : <Empty>No guardian is linked to this student, so reminders and payment notices have nobody to go to. Link one under Guardians.</Empty>}
              </Card></div>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
const nairaPlaceholder = (kobo: number) => `Up to ${naira(kobo)}`;
