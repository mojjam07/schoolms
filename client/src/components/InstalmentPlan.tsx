import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Select, SmallButton } from './ui';
import { api } from '../lib/api';
import { fmtDate, naira, nairaInput, toKobo } from '../lib/format';
import { useAction, useFetch } from '../lib/useFetch';

interface Item { position: number; dueDate: string; amountKobo: number; paidKobo: number; remainingKobo: number; status: 'paid' | 'partial' | 'overdue' | 'upcoming' }
interface Plan { invoiceId: string; number: string; invoiceOpen: boolean; totalKobo: number; paidKobo: number; outstandingKobo: number; hasPlan: boolean; outOfDate: boolean; planTotalKobo: number; instalments: Item[]; next: { dueDate: string; remainingKobo: number; status: string } | null }
interface Draft { dueDate: string; naira: string }
const tone = (s: Item['status']) => (s === 'paid' ? 'good' : s === 'overdue' || s === 'partial' ? 'warn' : undefined);
const label: Record<Item['status'], string> = { paid: 'Paid', partial: 'Part paid', overdue: 'Overdue', upcoming: 'Upcoming' };
const kobo = (v: string) => toKobo(v) ?? 0; // your toKobo returns null for text that is not an amount

// Drop this into an invoice page: <InstalmentPlan invoiceId={id} role="admin" /> or role="parent" (read-only).
export default function InstalmentPlan({ invoiceId, role }: { invoiceId: string; role: 'admin' | 'parent' }) {
  const base = `/instalments/${role}/invoice/${invoiceId}`;
  const d = useFetch<Plan>(base); const act = useAction();
  const [editing, setEditing] = useState(false); const [rows, setRows] = useState<Draft[]>([]);
  const [count, setCount] = useState('3'); const [first, setFirst] = useState(''); const [gap, setGap] = useState('30');
  useEffect(() => { setEditing(false); }, [invoiceId]);

  if (d.loading || !d.data) return null;
  if (!d.data.hasPlan && role === 'parent') return null; // no plan: nothing to show
  const p = d.data;
  const sum = rows.reduce((n, r) => n + kobo(r.naira), 0);

  const suggest = async () => {
    let got: { instalments: { dueDate: string; amountKobo: number }[] } | null = null;
    const ok = await act.run(async () => { got = await api(`${base}/suggest?count=${count}&firstDue=${first}&gapDays=${gap}`); });
    if (ok && got) setRows((got as typeof got).instalments.map((i) => ({ dueDate: i.dueDate, naira: nairaInput(i.amountKobo) })));
  };
  const save = async () => { if (await act.run(() => api(base, { method: 'PUT', body: { instalments: rows.map((r) => ({ dueDate: r.dueDate, amountKobo: kobo(r.naira) })) } }))) { setEditing(false); d.reload(); } };
  const clear = async () => { if (window.confirm('Remove the instalment plan? Payments already recorded are not affected.') && await act.run(() => api(base, { method: 'DELETE' }))) d.reload(); };
  const startEdit = () => { setRows(p.instalments.map((i) => ({ dueDate: i.dueDate, naira: nairaInput(i.amountKobo) }))); setEditing(true); };

  return (
    <Card title="Instalment plan">
      {act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}
      {p.hasPlan && !editing && (
        <>
          {p.outOfDate && <div className="mb-3"><Alert tone="error">The invoice total changed after this plan was made (plan {naira(p.planTotalKobo)}, invoice {naira(p.totalKobo)}). {role === 'admin' ? 'Please rebuild the plan.' : 'The school will update it.'}</Alert></div>}
          <table className="w-full text-sm"><caption className="sr-only">Instalments for invoice {p.number}</caption>
            <thead><tr><th scope="col" className="py-1 text-left">#</th><th scope="col" className="text-left">Due</th><th scope="col" className="text-right">Amount</th><th scope="col" className="text-right">Still to pay</th><th scope="col" className="text-right">Status</th></tr></thead>
            <tbody>{p.instalments.map((i) => (
              <tr key={i.position} className="border-t border-line"><td className="py-1">{i.position}</td><td>{fmtDate(i.dueDate)}</td><td className="text-right">{naira(i.amountKobo)}</td><td className="text-right">{naira(i.remainingKobo)}</td><td className="text-right"><Badge tone={tone(i.status)}>{label[i.status]}</Badge></td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Payments are matched to the earliest instalment first. Paying the whole balance early is always fine.</p>
          {role === 'admin' && p.invoiceOpen && <div className="mt-3 flex gap-2"><SmallButton onClick={startEdit}>Change plan</SmallButton><SmallButton onClick={clear}>Remove plan</SmallButton></div>}
        </>
      )}
      {!p.hasPlan && !editing && role === 'admin' && (
        p.invoiceOpen ? <Button onClick={() => { setRows([]); setEditing(true); }}>Set up an instalment plan</Button> : <p className="text-sm text-muted">This invoice is cancelled.</p>
      )}
      {editing && role === 'admin' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label="Instalments" value={count} onChange={(e) => setCount(e.target.value)}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
            <Field label="First due date" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
            <Field label="Days between" type="number" min={7} max={120} value={gap} onChange={(e) => setGap(e.target.value)} />
            <div className="flex items-end"><Button onClick={suggest} disabled={!first} loading={act.busy}>Split equally</Button></div>
          </div>
          {rows.length > 0 && (
            <>
              {rows.map((r, k) => (
                <div key={k} className="grid items-end gap-3 sm:grid-cols-2">
                  <Field label={`Instalment ${k + 1}: due date`} type="date" value={r.dueDate} onChange={(e) => setRows(rows.map((x, j) => (j === k ? { ...x, dueDate: e.target.value } : x)))} />
                  <Field label="Amount (naira)" inputMode="decimal" value={r.naira} onChange={(e) => setRows(rows.map((x, j) => (j === k ? { ...x, naira: e.target.value } : x)))} />
                </div>
              ))}
              <p className={`text-sm ${sum === p.totalKobo ? 'text-green-800' : 'text-red-700'}`}>Total {naira(sum)} of invoice {naira(p.totalKobo)}{sum === p.totalKobo ? ' ✓' : `: ${sum > p.totalKobo ? 'over' : 'short'} by ${naira(Math.abs(sum - p.totalKobo))}`}</p>
              <div className="flex gap-2"><Button onClick={save} loading={act.busy} disabled={sum !== p.totalKobo}>Save plan</Button><Button onClick={() => setEditing(false)}>Cancel</Button></div>
            </>
          )}
          {rows.length === 0 && <Button onClick={() => setEditing(false)}>Cancel</Button>}
        </div>
      )}
    </Card>
  );
}
