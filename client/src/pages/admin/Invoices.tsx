import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { InvoiceStatus } from '../../components/FeeBits';
import { api, downloadFromApi } from '../../lib/api';
import { fmtDate, naira } from '../../lib/format';
import type { FeeReport, InvoiceRow, Paged, SchoolClass, Session, Term } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export interface ReminderResult { invoices: number; noLinkedGuardian: number; inAppSent: number; alreadySentToday: number; emailsAccepted: number; emailsNotSent: number; emailsFailed: number }

// Says exactly what happened. "Accepted" means the email service took the message, not that it reached an inbox.
export function ReminderSummary({ r }: { r: ReminderResult }) {
  return (
    <Alert tone={r.emailsFailed ? 'error' : 'success'}>
      Checked {r.invoices} invoice{r.invoices === 1 ? '' : 's'} with a balance. In-app reminders sent: {r.inAppSent}.
      {r.alreadySentToday > 0 && ` Already reminded today: ${r.alreadySentToday}.`}
      {r.noLinkedGuardian > 0 && ` No guardian linked (nobody to remind): ${r.noLinkedGuardian}.`}
      {' '}Emails: {r.emailsAccepted} accepted by the email service, {r.emailsNotSent} not sent (no email service set up), {r.emailsFailed} failed. "Accepted" means handed to the email service, not confirmed delivered.
    </Alert>
  );
}

export default function Invoices() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const termsQ = useFetch<Term[]>('/academic/terms');
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const terms = [...(termsQ.data ?? [])].sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
  const label = (t: Term) => `${sessions.data?.find((s) => s.id === t.sessionId)?.name ?? ''} · ${t.name}`;
  const [termId, setTermId] = useState(''); const tid = termId || (terms.find((t) => t.isCurrent) ?? terms[0])?.id || '';
  const [classId, setClassId] = useState(''); const [status, setStatus] = useState(''); const [q, setQ] = useState('');

  const report = useFetch<FeeReport>(tid ? `/fees/report?termId=${tid}` : null);
  const qs = new URLSearchParams({ termId: tid, pageSize: '100', ...(classId && { classId }), ...(status && { status }), ...(q.trim() && { q: q.trim() }) });
  const list = useFetch<Paged<InvoiceRow>>(tid ? `/fees/invoices?${qs}` : null);
  const act = useAction(); const [result, setResult] = useState<ReminderResult | null>(null);

  async function remind() {
    const who = classId ? `students in ${classes.data?.find((c) => c.id === classId)?.name}` : 'all students';
    if (!window.confirm(`Send a fees reminder to the guardians of ${who} who still owe money for this term?`)) return;
    setResult(null);
    let r: ReminderResult | undefined;
    if (await act.run(async () => { r = await api<ReminderResult>('/fees/reminders', { body: { termId: tid, ...(classId ? { classId } : {}) } }); })) setResult(r!);
  }

  const dl = useAction();
  const exportQs = new URLSearchParams({ termId: tid, ...(classId && { classId }), ...(status && { status }) });
  const R = report.data;
  return (
    <>
      <PageHeader title="Invoices and payments" intro="See who owes what, record payments made at the school or by transfer, and remind parents." />
      {!termsQ.loading && !terms.length ? <Card><Empty>Set up a session and term first.</Empty></Card> : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-4">
            <div className="w-full max-w-sm"><Select label="Term" value={tid} onChange={(e) => setTermId(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select></div>
            <div className="flex flex-wrap gap-2">
              <SmallButton disabled={!tid || dl.busy} onClick={() => dl.run(() => downloadFromApi(`/fees/export/summary.csv?termId=${tid}`, 'fees-summary.csv'))}>Download summary (CSV)</SmallButton>
              <SmallButton disabled={!tid || dl.busy} onClick={() => dl.run(() => downloadFromApi(`/fees/export/invoices.csv?${exportQs}`, 'invoices.csv'))}>Download invoices (CSV)</SmallButton>
              <SmallButton disabled={!tid || dl.busy} onClick={() => dl.run(() => downloadFromApi(`/fees/export/payments.csv?termId=${tid}`, 'payments.csv'))}>Download payments (CSV)</SmallButton>
            </div>
          </div>
          {dl.error && <div className="mb-4"><Alert tone="error">{dl.error}</Alert></div>}
          <DataState loading={report.loading && !R} error={report.error}>
            {R && (
              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card title="Billed"><p className="text-2xl font-semibold">{naira(R.billedKobo)}</p><p className="text-sm text-muted">{R.invoices} invoice{R.invoices === 1 ? '' : 's'}</p></Card>
                <Card title="Collected"><p className="text-2xl font-semibold">{naira(R.collectedKobo)}</p></Card>
                <Card title="Outstanding"><p className="text-2xl font-semibold">{naira(R.outstandingKobo)}</p><p className="text-sm text-muted">{R.studentsOwing} student{R.studentsOwing === 1 ? '' : 's'} owing</p></Card>
                <Card title="Overdue"><p className="text-2xl font-semibold">{R.studentsOverdue}</p><p className="text-sm text-muted">past their payment deadline</p></Card>
              </div>
            )}
            {R && R.byClass.length > 0 && (
              <div className="mb-6"><Card title="By class"><Table>
                <thead><tr><Th>Class</Th><Th>Billed</Th><Th>Collected</Th><Th>Outstanding</Th><Th>Owing</Th></tr></thead>
                <tbody>{R.byClass.map((c) => <tr key={c.classId}><Td>{c.className}</Td><Td>{naira(c.billedKobo)}</Td><Td>{naira(c.collectedKobo)}</Td><Td>{naira(c.outstandingKobo)}</Td><Td>{c.studentsOwing}</Td></tr>)}</tbody>
              </Table></Card></div>
            )}
          </DataState>

          {act.error && <div className="mb-4"><Alert tone="error">{act.error}</Alert></div>}
          {result && <div className="mb-4"><ReminderSummary r={result} /></div>}
          <Card title="Invoices" action={<SmallButton onClick={remind} disabled={act.busy || !R?.studentsOwing}>Remind parents who owe{classId ? ' in this class' : ''}</SmallButton>}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Field label="Search" placeholder="Name, admission no. or invoice no." value={q} onChange={(e) => setQ(e.target.value)} />
              <Select label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any status</option><option value="unpaid">Unpaid</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option>
              </Select>
            </div>
            <DataState loading={list.loading && !list.data} error={list.error}>
              {list.data?.items.length ? (
                <Table>
                  <thead><tr><Th>Student</Th><Th>Invoice</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th><Th /></tr></thead>
                  <tbody>{list.data.items.map((i) => (
                    <tr key={i.id}>
                      <Td><div className="font-medium">{i.studentName}</div><div className="text-muted">{i.className} · {i.admissionNumber}</div></Td>
                      <Td>{i.number}{i.dueDate && <div className="text-muted">Due {fmtDate(i.dueDate)}</div>}</Td>
                      <Td>{naira(i.totalKobo)}</Td><Td>{naira(i.paidKobo)}</Td><Td className="font-medium">{naira(i.balanceKobo)}</Td>
                      <Td><InvoiceStatus i={i} /></Td>
                      <Td className="text-right"><Link className="font-medium text-brand-700 underline" to={`/admin/invoices/${i.id}`}>Open</Link></Td>
                    </tr>))}</tbody>
                </Table>
              ) : <Empty>No invoices match. Create them under Fee setup.</Empty>}
              {list.data && list.data.total > list.data.items.length && <p className="mt-3 text-sm text-muted">Showing {list.data.items.length} of {list.data.total}. Narrow the search to see others.</p>}
            </DataState>
          </Card>
        </>
      )}
    </>
  );
}
