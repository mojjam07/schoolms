import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, DataState, Empty, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, naira } from '../../lib/format';
import type { OnlinePayment, Paged } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

const TONE = { success: 'good', pending: 'warn', failed: 'bad', abandoned: 'neutral' } as const;
const LABEL = { success: 'Paid', pending: 'Waiting', failed: 'Failed', abandoned: 'Not completed' } as const;
const OUTCOME: Record<string, string> = {
  applied: 'The payment is now counted on the invoice.', already_applied: 'This payment was already counted.', pending: 'Paystack says it is still in progress.',
  failed: 'Paystack says the payment failed. Nothing was counted.', abandoned: 'Paystack says the payment was not completed. Nothing was counted.',
  mismatch: 'The amount did not match what was expected. Nothing was counted: see the note.', invoice_cancelled: 'The invoice was cancelled. Nothing was counted: refund the parent in Paystack.',
};

export default function OnlinePayments() {
  const [status, setStatus] = useState(''); const [review, setReview] = useState(false);
  const list = useFetch<Paged<OnlinePayment>>(`/fees/online-payments?pageSize=100${status ? `&status=${status}` : ''}${review ? '&needsReview=true' : ''}`);
  const act = useAction(); const [note, setNote] = useState('');
  const webhook = `${(import.meta.env.VITE_API_URL ?? window.location.origin).replace(/\/+$/, '')}/api/webhooks/paystack`;

  async function recheck(t: OnlinePayment) {
    setNote('');
    let outcome = '';
    if (await act.run(async () => { outcome = (await api<{ outcome: string }>(`/fees/online-payments/${t.id}/recheck`, { method: 'POST', body: {} })).outcome; })) { setNote(`${t.reference}: ${OUTCOME[outcome] ?? outcome}`); list.reload(); }
  }

  return (
    <>
      <PageHeader title="Online payments" intro="Every payment parents have started through Paystack, and anything that needs your attention." />
      {act.error && <div className="mb-4"><Alert tone="error">{act.error}</Alert></div>}
      {note && <div className="mb-4"><Alert tone="success">{note}</Alert></div>}
      <Card title="Payments">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="w-52"><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="success">Paid</option><option value="pending">Waiting</option><option value="failed">Failed</option><option value="abandoned">Not completed</option></Select></div>
          <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={review} onChange={(e) => setReview(e.target.checked)} />Needs attention only</label>
        </div>
        <DataState loading={list.loading && !list.data} error={list.error}>
          {list.data?.items.length ? (
            <Table>
              <thead><tr><Th>Started</Th><Th>Student and payer</Th><Th>Amount</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{list.data.items.map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDateTime(t.createdAt)}<div className="break-all text-xs text-muted">{t.reference}</div></Td>
                  <Td><Link className="font-medium text-brand-700 underline" to={`/admin/invoices/${t.invoiceId}`}>{t.studentName}</Link><div className="text-muted">paid by {t.payerName} · {t.invoiceNumber}</div></Td>
                  <Td>{naira(t.amountKobo)}{t.receiptNumber && <div className="text-muted">{t.receiptNumber}</div>}</Td>
                  <Td><Badge tone={TONE[t.status]}>{LABEL[t.status]}</Badge>{t.reviewNote && <div className="mt-1 max-w-xs text-sm text-red-800">{t.reviewNote}</div>}</Td>
                  <Td className="text-right">{!t.receiptNumber && t.status !== 'success' && <SmallButton onClick={() => recheck(t)} disabled={act.busy}>Check with Paystack</SmallButton>}</Td>
                </tr>))}</tbody>
            </Table>
          ) : <Empty>{review ? 'Nothing needs your attention.' : 'No online payments yet.'}</Empty>}
        </DataState>
      </Card>
      <div className="mt-6"><Card title="Setting up Paystack">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>In the Paystack dashboard open Settings, then API Keys &amp; Webhooks, and copy the <strong>test secret key</strong> into the server setting <code>PAYSTACK_SECRET_KEY</code>. Never put it in the website code.</li>
          <li>In the same place, set the webhook URL to <code className="break-all">{webhook}</code></li>
          <li>Make a test payment with one of Paystack's test cards. When you are ready for real money, replace the key with the live secret key and set the webhook on the live dashboard too.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">The webhook lets Paystack tell the school about a payment even if the parent closes the page. Without it, payments are still counted when the parent returns, or when you press "Check with Paystack".</p>
      </Card></div>
    </>
  );
}
