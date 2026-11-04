import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, Table, Td, TextArea, Th } from '../../../components/ui';
import { api } from '../../../lib/api';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { Paged } from '../../../lib/types';
import { useAction, useFetch } from '../../../lib/useFetch';

interface App { id: string; reference: string; applicantName: string; applyingFor: string; status: string; statusLabel: string; guardianName: string; guardianEmail: string; guardianPhone: string; submittedAt: string; emailStatus: string | null;
  dateOfBirth?: string; previousSchool?: string | null; address?: string | null; message?: string | null; publicNote?: string | null; adminNote?: string | null; consentAt?: string }
const STATUSES: [string, string][] = [['received', 'Received'], ['under_review', 'Under review'], ['interview', 'Invited for an interview'], ['offered', 'Offer made'], ['declined', 'Not successful'], ['withdrawn', 'Withdrawn']];
const TONE: Record<string, 'warn' | 'neutral' | 'good' | 'bad'> = { received: 'warn', under_review: 'neutral', interview: 'neutral', offered: 'good', declined: 'bad', withdrawn: 'neutral' };
const EMAIL: Record<string, string> = { accepted: 'Email accepted by the email service (not proof it reached the inbox)', not_sent: 'No email was sent: no email service is set up', failed: 'The email service refused the email' };

function Detail({ id, onSaved }: { id: string; onSaved: () => void }) {
  const d = useFetch<App>(`/admin/site/applications/${id}`);
  const [status, setStatus] = useState(''); const [pub, setPub] = useState(''); const [priv, setPriv] = useState(''); const act = useAction(); const [msg, setMsg] = useState('');
  useEffect(() => { if (d.data) { setStatus(d.data.status); setPub(d.data.publicNote ?? ''); setPriv(d.data.adminNote ?? ''); } }, [d.data]); // keep the "saved" message on screen after the reload
  async function save() { setMsg(''); if (await act.run(() => api(`/admin/site/applications/${id}/status`, { method: 'PATCH', body: { status, publicNote: pub, adminNote: priv } }))) { setMsg(status !== d.data?.status ? 'Saved. The guardian was emailed about the change (see the email result below).' : 'Saved.'); d.reload(); onSaved(); } }
  const a = d.data;
  return (
    <Card title={a ? `${a.applicantName} · ${a.reference}` : 'Application'}>
      <DataState loading={d.loading && !a} error={d.error}>
        {a && (
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Applying for</dt><dd className="font-medium">{a.applyingFor}</dd></div><div><dt className="text-muted">Date of birth</dt><dd className="font-medium">{fmtDate(a.dateOfBirth ?? null)}</dd></div>
              <div><dt className="text-muted">Parent or guardian</dt><dd className="font-medium">{a.guardianName}</dd></div><div><dt className="text-muted">Phone</dt><dd className="font-medium"><a className="underline" href={`tel:${a.guardianPhone.replace(/\s/g, '')}`}>{a.guardianPhone}</a></dd></div>
              <div><dt className="text-muted">Email</dt><dd className="break-all font-medium"><a className="underline" href={`mailto:${a.guardianEmail}`}>{a.guardianEmail}</a></dd></div><div><dt className="text-muted">Previous school</dt><dd className="font-medium">{a.previousSchool || '-'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Home address</dt><dd className="font-medium">{a.address || '-'}</dd></div>
              {a.message && <div className="sm:col-span-2"><dt className="text-muted">Message</dt><dd className="whitespace-pre-line">{a.message}</dd></div>}
              <div className="sm:col-span-2 text-muted">Submitted {fmtDateTime(a.submittedAt)} · guardian agreed to the privacy notice {fmtDateTime(a.consentAt ?? null)}</div>
            </dl>
            <div className="grid gap-4 border-t border-line pt-5 lg:max-w-xl">
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <TextArea label="Note the family will see (optional)" rows={3} value={pub} onChange={(e) => setPub(e.target.value)} hint="Shown on the status page and in the email, for example interview time." />
              <TextArea label="Private note (only administrators see this)" rows={3} value={priv} onChange={(e) => setPriv(e.target.value)} />
              {a.emailStatus && <p className="text-sm text-muted">Last email to the guardian: {EMAIL[a.emailStatus] ?? a.emailStatus}</p>}
              {act.error && <Alert tone="error">{act.error}</Alert>}{msg && <Alert tone="success">{msg}</Alert>}
              <div className="max-w-xs"><Button onClick={save} loading={act.busy}>Save</Button></div>
            </div>
          </div>
        )}
      </DataState>
    </Card>
  );
}

export default function Applications() {
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [open, setOpen] = useState('');
  const list = useFetch<Paged<App>>(`/admin/site/applications?pageSize=100${status ? `&status=${status}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
  return (
    <>
      <PageHeader title="Admission applications" intro="Applications sent through the website. Accepting a child as a student is done by creating their account under Accounts." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><Field label="Search" placeholder="Name, reference or email" value={q} onChange={(e) => setQ(e.target.value)} /><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
        <DataState loading={list.loading && !list.data} error={list.error}>
          {list.data?.items.length ? <Table><thead><tr><Th>Applicant</Th><Th>For</Th><Th>Status</Th><Th>Received</Th><Th /></tr></thead><tbody>{list.data.items.map((a) => (
            <tr key={a.id} className={open === a.id ? 'bg-brand-50' : ''}><Td><div className="font-medium">{a.applicantName}</div><div className="text-muted">{a.reference}</div></Td><Td>{a.applyingFor}</Td><Td><Badge tone={TONE[a.status]}>{a.statusLabel}</Badge></Td><Td>{fmtDate(a.submittedAt.slice(0, 10))}</Td>
              <Td className="text-right"><button className="font-medium text-brand-700 underline" onClick={() => setOpen(a.id)}>Open</button></Td></tr>))}</tbody></Table> : <Empty>No applications yet. They appear here when families apply on the website.</Empty>}
        </DataState>
      </Card>
      {open && <div className="mt-6"><Detail key={open} id={open} onSaved={list.reload} /></div>}
    </>
  );
}
