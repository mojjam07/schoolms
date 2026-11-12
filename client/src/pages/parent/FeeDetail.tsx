import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, DataState, Empty, Field, PageHeader, SmallButton, Table, Td, Th } from '../../components/ui';
import { InvoiceStatus, METHOD_LABEL } from '../../components/FeeBits';
import InstalmentPlan from '../../components/InstalmentPlan';
import DownloadPdfButton from '../../components/DownloadPdfButton';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime, nairaInput, naira, toKobo } from '../../lib/format';
import type { ParentInvoiceDetail } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

type Verdict = { tone: 'success' | 'error'; text: string };
const MESSAGES: Record<string, Verdict> = {
  applied: { tone: 'success', text: 'Payment received. Thank you! Your receipt is listed below.' },
  already_applied: { tone: 'success', text: 'This payment has already been received. Thank you!' },
  pending: { tone: 'error', text: 'Paystack is still confirming this payment. Nothing is lost: check again in a minute, or you will get a notification once it is confirmed.' },
  failed: { tone: 'error', text: 'The payment did not go through, so nothing was counted. You can try again.' },
  abandoned: { tone: 'error', text: 'The payment was not completed, so nothing was counted. You can try again.' },
  mismatch: { tone: 'error', text: 'We could not match this payment to the invoice, so nothing was counted. Please contact the school office.' },
  invoice_cancelled: { tone: 'error', text: 'This invoice was cancelled, so the payment was not counted. Please contact the school office.' },
};

export default function ParentFeeDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const inv = useFetch<ParentInvoiceDetail>(`/parents/me/invoices/${id}`);
  const d = inv.data;
  const [amount, setAmount] = useState(''); const [verdict, setVerdict] = useState<Verdict | null>(null);
  const start = useAction(); const check = useAction();

  // Paystack sends the parent back here with ?reference=... . That alone proves nothing, so ask the server to confirm it.
  const returned = params.get('reference') ?? params.get('trxref');
  const handled = useRef('');
  async function confirm(reference: string) {
    setVerdict(null);
    let outcome = '';
    if (await check.run(async () => { outcome = (await api<{ outcome: string }>('/parents/me/payments/verify', { body: { reference } })).outcome; })) { setVerdict(MESSAGES[outcome] ?? MESSAGES.pending); inv.reload(); }
  }
  useEffect(() => {
    if (returned && handled.current !== returned) { handled.current = returned; confirm(returned).finally(() => navigate(`/parent/fees/${id}`, { replace: true })); }
  }, [returned]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay(e: FormEvent) {
    e.preventDefault();
    const kobo = amount.trim() ? toKobo(amount) : d!.balanceKobo;
    if (kobo === null || kobo <= 0) return;
    let url = '';
    if (await start.run(async () => { url = (await api<{ authorizationUrl: string }>(`/parents/me/invoices/${id}/pay`, { body: { amountKobo: kobo } })).authorizationUrl; })) {
      if (url.startsWith('https://')) window.location.assign(url);
    }
  }
  const amountBad = amount.trim() !== '' && toKobo(amount) === null;

  return (
    <>
      <p className="mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/parent/fees">All fees</Link></p>
      <DataState loading={inv.loading && !d} error={inv.error}>
        {d && (
          <>
            <PageHeader title={`${d.studentName}: ${d.sessionName} ${d.termName}`} intro={`${d.className} · ${d.number}${d.dueDate ? ` · pay by ${fmtDate(d.dueDate)}` : ''}`} />
            {verdict && <div className="mb-4"><Alert tone={verdict.tone}>{verdict.text}</Alert></div>}
            {check.error && <div className="mb-4"><Alert tone="error">{check.error}</Alert></div>}
            <div className="mb-6 flex flex-wrap items-center gap-3"><InvoiceStatus i={d} /><span className="text-lg font-semibold">{d.balanceKobo > 0 ? `${naira(d.balanceKobo)} to pay` : 'Nothing to pay'}</span><DownloadPdfButton path={`/pdf/invoices/${id}`} filename={`statement-${d.number}.pdf`} label="Download statement (PDF)" /></div>

            {d.balanceKobo > 0 && (
              <div className="mb-6">
                <Card title="Pay now">
                  {d.onlinePaymentAvailable ? (
                    <form onSubmit={pay} className="grid gap-4 lg:max-w-xl" noValidate>
                      <Field label="Amount to pay (₦)" inputMode="decimal" placeholder={nairaInput(d.balanceKobo)} value={amount} error={amountBad ? 'Enter an amount like 50000 or 50000.50' : start.fields.amountKobo}
                        hint={`Leave empty to pay the full ${naira(d.balanceKobo)}. You can also pay part now and the rest later.`} onChange={(e) => setAmount(e.target.value)} />
                      {start.error && !start.fields.amountKobo && <Alert tone="error">{start.error}</Alert>}
                      <div className="max-w-xs"><Button type="submit" loading={start.busy} disabled={amountBad}>Pay with Paystack</Button></div>
                      <p className="text-sm text-muted">You will be taken to Paystack's secure page to pay by card, bank transfer or USSD. The school never sees your card details. Nothing is counted as paid until Paystack confirms it. You can also pay at the school office.</p>
                    </form>
                  ) : <p>Online payment is not available yet. To pay now, please pay at the school office, then keep your receipt. Once the school records your payment it appears below and you will get a notification.</p>}
                  {d.pendingPayments.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="mb-2 font-medium">Payments waiting for confirmation</p>
                      <ul className="space-y-2">{d.pendingPayments.map((p) => (
                        <li key={p.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                          <span>{naira(p.amountKobo)} · started {fmtDateTime(p.startedAt)}</span>
                          <SmallButton onClick={() => confirm(p.reference)} disabled={check.busy}>Check payment status</SmallButton>
                        </li>))}</ul>
                      <p className="mt-2 text-sm text-muted">If you finished paying and it has not appeared, press the button. If you did not finish, you can ignore it: nothing is charged.</p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="What the fees cover">
                <Table><thead><tr><Th>Item</Th><Th>Amount</Th></tr></thead>
                  <tbody>{d.lines.map((l) => <tr key={l.id}><Td>{l.description}{l.reason && <div className="text-muted">{l.reason}</div>}</Td><Td>{l.amountKobo < 0 ? '-' : ''}{naira(Math.abs(l.amountKobo))}</Td></tr>)}
                    <tr><Td className="font-semibold">Total</Td><Td className="font-semibold">{naira(d.totalKobo)}</Td></tr></tbody></Table>
              </Card>
              <Card title="Payments received">
                {d.payments.length ? (
                  <Table><thead><tr><Th>Payment</Th><Th>Amount</Th></tr></thead>
                    <tbody>{d.payments.map((p) => (
                      <tr key={p.id} className={p.reversed ? 'text-muted line-through' : ''}>
                        <Td>{fmtDateTime(p.paidAt)}<div className="text-muted">{METHOD_LABEL[p.method]} · {p.receiptNumber}</div>
                          <div className="no-underline">{p.reversed ? <span>Reversed</span> : <><Link className="font-medium text-brand-700 underline" to={`/parent/receipts/${p.id}`}>View receipt</Link> <DownloadPdfButton path={`/pdf/receipts/${p.id}`} filename={`receipt-${p.receiptNumber}.pdf`} label="PDF" /></>}</div></Td>
                        <Td>{naira(p.amountKobo)}</Td>
                      </tr>))}</tbody></Table>
                ) : <Empty>No payments received yet.</Empty>}
              </Card>
            </div>

            <div className="mt-6">
              <InstalmentPlan invoiceId={id} role="parent" />
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
