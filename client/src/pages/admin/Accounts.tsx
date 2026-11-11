import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Account, AccountDetail, Paged } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent or guardian' } as const;
const EMPTY = { role: 'student', firstName: '', lastName: '', email: '', phone: '', admissionNumber: '', staffNumber: '' };
type Notice = { email: string; emailAccepted: boolean; link?: string };

function EditPanel({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (note: Notice | null) => void }) {
  const d = useFetch<AccountDetail>(`/users/${id}`);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', admissionNumber: '', staffNumber: '', dateOfBirth: '' });
  const act = useAction();
  const u = d.data;
  const [loadedFor, setLoadedFor] = useState('');
  if (u && loadedFor !== u.id + u.email + u.firstName + u.lastName + (u.phone ?? '') + (u.admissionNumber ?? '') + (u.staffNumber ?? '') + (u.dateOfBirth ?? '')) {
    setLoadedFor(u.id + u.email + u.firstName + u.lastName + (u.phone ?? '') + (u.admissionNumber ?? '') + (u.staffNumber ?? '') + (u.dateOfBirth ?? ''));
    setF({ firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone ?? '', admissionNumber: u.admissionNumber ?? '', staffNumber: u.staffNumber ?? '', dateOfBirth: u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : '' });
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!u) return;
    const body: Record<string, unknown> = {};
    if (f.firstName !== u.firstName) body.firstName = f.firstName;
    if (f.lastName !== u.lastName) body.lastName = f.lastName;
    if (f.email.trim().toLowerCase() !== u.email.toLowerCase()) body.email = f.email.trim();
    if (f.phone.trim() !== (u.phone ?? '')) body.phone = f.phone.trim() || null;
    if (u.role === 'student') {
      if (f.admissionNumber !== (u.admissionNumber ?? '')) body.admissionNumber = f.admissionNumber;
      if (f.dateOfBirth !== (u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : '')) body.dateOfBirth = f.dateOfBirth || null;
    }
    if (u.role === 'teacher' && f.staffNumber !== (u.staffNumber ?? '')) body.staffNumber = f.staffNumber;
    if (!Object.keys(body).length) { onClose(); return; }
    let r: { emailAccepted?: boolean; activationLink?: string } | undefined;
    if (await act.run(async () => { r = await api(`/users/${id}`, { method: 'PATCH', body }); })) {
      onSaved(r && 'emailAccepted' in r ? { email: f.email, emailAccepted: !!r.emailAccepted, link: r.activationLink } : null);
    }
  }
  return (
    <Card title={u ? `Edit ${u.firstName} ${u.lastName}` : 'Edit account'} action={<SmallButton onClick={onClose}>Close</SmallButton>}>
      <DataState loading={d.loading && !u} error={d.error}>
        {u && (
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field label="First name" value={f.firstName} error={act.fields.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <Field label="Last name" value={f.lastName} error={act.fields.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            <Field label="Email" type="email" value={f.email} error={act.fields.email} onChange={(e) => setF({ ...f, email: e.target.value })}
              hint={u.status === 'pending' ? 'Not activated yet: a new activation email goes to the new address.' : 'Changing it signs the person out everywhere. They sign in with the new address.'} />
            <Field label="Phone" type="tel" value={f.phone} error={act.fields.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            {u.role === 'student' && <>
              <Field label="Admission number" value={f.admissionNumber} error={act.fields.admissionNumber} onChange={(e) => setF({ ...f, admissionNumber: e.target.value })} />
              <Field label="Date of birth" type="date" value={f.dateOfBirth} error={act.fields.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} />
            </>}
            {u.role === 'teacher' && <Field label="Staff number" value={f.staffNumber} error={act.fields.staffNumber} onChange={(e) => setF({ ...f, staffNumber: e.target.value })} />}
            {act.error && <Alert tone="error">{act.error}</Alert>}
            <Button type="submit" loading={act.busy}>Save changes</Button>
          </form>
        )}
      </DataState>
    </Card>
  );
}

export default function Accounts() {
  const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const qs = new URLSearchParams({ pageSize: '50', ...(role && { role }), ...(status && { status }), ...(q.trim() && { q: q.trim() }) });
  const users = useFetch<Paged<Account>>(`/users?${qs}`);
  const [form, setForm] = useState(EMPTY);
  const create = useAction(); const row = useAction();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setNotice(null);
    const body: Record<string, string> = { role: form.role, firstName: form.firstName, lastName: form.lastName, email: form.email };
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.role === 'student') body.admissionNumber = form.admissionNumber;
    if (form.role === 'teacher') body.staffNumber = form.staffNumber;
    let result: { emailAccepted: boolean; activationLink?: string } | undefined;
    if (await create.run(async () => { result = await api('/users', { body }); })) {
      setNotice({ email: form.email, emailAccepted: !!result?.emailAccepted, link: result?.activationLink });
      setForm({ ...EMPTY, role: form.role }); users.reload();
    }
  }
  async function resend(u: Account) {
    setNotice(null);
    let result: { emailAccepted: boolean; activationLink?: string } | undefined;
    if (await row.run(async () => { result = await api(`/users/${u.id}/resend-activation`, { method: 'POST', body: {} }); })) {
      setNotice({ email: u.email, emailAccepted: !!result?.emailAccepted, link: result?.activationLink });
    }
  }
  async function setAccountStatus(u: Account, next: 'active' | 'suspended') {
    if (await row.run(() => api(`/users/${u.id}/status`, { method: 'PATCH', body: { status: next } }))) users.reload();
  }

  return (
    <>
      <PageHeader title="Accounts" intro="Create accounts for staff, students and parents. Each person gets an email to set their own password." />
      {notice && (
        <div className="mb-6"><Alert tone={notice.emailAccepted ? 'success' : 'error'}>
          {notice.emailAccepted
            ? `An activation email for ${notice.email} was accepted by the email service.`
            : `The activation email for ${notice.email} was not sent because no email service is configured or it refused the message.`}
          {notice.link && <> Development link: <a className="break-all underline" href={notice.link}>{notice.link}</a></>}
        </Alert></div>
      )}
      {row.error && <div className="mb-4"><Alert tone="error">{row.error}</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="All accounts">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label="Search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="pending">Waiting to activate</option><option value="active">Active</option><option value="suspended">Suspended</option>
            </Select>
          </div>
          <DataState loading={users.loading} error={users.error}>
            {users.data?.items.length ? (
              <Table>
                <thead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {users.data.items.map((u) => (
                    <tr key={u.id}>
                      <Td><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-muted">{u.email}</div></Td>
                      <Td>{ROLE_LABEL[u.role]}</Td>
                      <Td>{u.status === 'active' ? <Badge tone="good">Active</Badge> : u.status === 'pending' ? <Badge tone="warn">Waiting to activate</Badge> : <Badge tone="bad">Suspended</Badge>}</Td>
                      <Td className="text-right">
                        <SmallButton onClick={() => { setEditing(u.id); setNotice(null); }}>Edit</SmallButton>{' '}
                        {u.status === 'pending' && <SmallButton onClick={() => resend(u)} disabled={row.busy}>Resend email</SmallButton>}
                        {u.status === 'active' && <SmallButton tone="danger" onClick={() => setAccountStatus(u, 'suspended')} disabled={row.busy}>Suspend</SmallButton>}
                        {u.status === 'suspended' && <SmallButton onClick={() => setAccountStatus(u, 'active')} disabled={row.busy}>Reactivate</SmallButton>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <Empty>No accounts match.</Empty>}
            {users.data && users.data.total > users.data.items.length && <p className="mt-3 text-sm text-muted">Showing {users.data.items.length} of {users.data.total}. Narrow the search to see others.</p>}
          </DataState>
        </Card>

        {editing && <EditPanel key={editing} id={editing} onClose={() => setEditing(null)} onSaved={(n) => { setEditing(null); setNotice(n); users.reload(); }} />}
        {!editing && <Card title="New account">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Field label="First name" value={form.firstName} error={create.fields.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Field label="Last name" value={form.lastName} error={create.fields.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Field label="Email" type="email" value={form.email} error={create.fields.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Field label="Phone (optional)" type="tel" value={form.phone} error={create.fields.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {form.role === 'student' && <Field label="Admission number" hint="Must be unique." value={form.admissionNumber} error={create.fields.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} />}
            {form.role === 'teacher' && <Field label="Staff number" hint="Must be unique." value={form.staffNumber} error={create.fields.staffNumber} onChange={(e) => setForm({ ...form, staffNumber: e.target.value })} />}
            {create.error && <Alert tone="error">{create.error}</Alert>}
            <Button type="submit" loading={create.busy}>Create account</Button>
          </form>
        </Card>}
      </div>
    </>
  );
}
