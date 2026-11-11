import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, Table, Td, TextArea, Th } from '../../../components/ui';
import { api } from '../../../lib/api';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { Paged, SchoolClass } from '../../../lib/types';
import { useAction, useFetch } from '../../../lib/useFetch';

interface App { id: string; reference: string; applicantName: string; applyingFor: string; status: string; statusLabel: string; guardianName: string; guardianEmail: string; guardianPhone: string; submittedAt: string; emailStatus: string | null;
  dateOfBirth?: string; previousSchool?: string | null; address?: string | null; message?: string | null; convertedStudentId?: string | null; publicNote?: string | null; adminNote?: string | null; consentAt?: string }
const STATUSES: [string, string][] = [['received', 'Received'], ['under_review', 'Under review'], ['interview', 'Invited for an interview'], ['offered', 'Offer made'], ['declined', 'Not successful'], ['withdrawn', 'Withdrawn']];
const TONE: Record<string, 'warn' | 'neutral' | 'good' | 'bad'> = { received: 'warn', under_review: 'neutral', interview: 'neutral', offered: 'good', declined: 'bad', withdrawn: 'neutral' };
const EMAIL: Record<string, string> = { accepted: 'Email accepted by the email service (not proof it reached the inbox)', not_sent: 'No email was sent: no email service is set up', failed: 'The email service refused the email' };

function Convert({ a, onDone }: { a: App; onDone: () => void }) {
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const fits = classes.data?.filter((c) => c.name.startsWith(a.applyingFor)) ?? [];
  const [email, setEmail] = useState(''); const [adm, setAdm] = useState(''); const [classId, setClassId] = useState(''); const [parent, setParent] = useState(true);
  const act = useAction(); const [msg, setMsg] = useState('');
  async function go() {
    setMsg('');
    let r: { parent: string; studentEmailAccepted: boolean } | undefined;
    if (await act.run(async () => { r = await api('/admin/site/applications/' + a.id + '/convert', { body: { email, admissionNumber: adm, ...(classId ? { classId } : {}), createParent: parent } }); })) {
      setMsg(`${a.applicantName} is now a student. ${r!.parent === 'created' ? 'A guardian account was created and linked. ' : r!.parent === 'linked' ? 'Linked to the guardian’s existing account. ' : r!.parent === 'email_belongs_to_other_role' ? 'The guardian’s email already belongs to a non-parent account, so no guardian was linked; link one under Guardians. ' : 'No guardian account was created; link one under Guardians. '}Activation emails ${r!.studentEmailAccepted ? 'were accepted by the email service' : 'were not sent (no email service or it refused), use Resend email on the Accounts page'}.`);
      onDone();
    }
  }
  return (
    <div className="border-t border-line pt-5 lg:max-w-xl">
      <h3 className="mb-1 font-semibold">Make this applicant a student</h3>
      <p className="mb-3 text-sm text-muted">Creates the student account from this application (name and date of birth are copied) and optionally places them in a class for the current session.</p>
      <div className="grid gap-4">
        <Field label="Student’s own email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="Every account needs its own address, different from the guardian’s." />
        <Field label="Admission number" value={adm} onChange={(e) => setAdm(e.target.value)} />
        <Select label="Class (optional)" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Do not place in a class yet</option>{fits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={parent} onChange={(e) => setParent(e.target.checked)} /> Create a guardian account for {a.guardianName} ({a.guardianEmail}) if there is none, and link it</label>
        {act.error && <Alert tone="error">{act.error}</Alert>}{msg && <Alert tone="success">{msg}</Alert>}
        <div className="max-w-xs"><Button onClick={go} loading={act.busy} disabled={!email || !adm}>Create student account</Button></div>
      </div>
    </div>
  );
}

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
            {a.convertedStudentId ? <p className="border-t border-line pt-5 text-sm"><Badge tone="good">Already a student</Badge> This applicant has been made a student. Find them under Accounts.</p>
              : a.status === 'offered' ? <Convert a={a} onDone={() => { d.reload(); onSaved(); }} />
              : <p className="border-t border-line pt-5 text-sm text-muted">To create a student account from this application, set the status to “Offer made” and save.</p>}
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
      <PageHeader title="Admission applications" intro="Applications sent through the website. Once an offer is made, you can create the student account straight from the application." />
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
