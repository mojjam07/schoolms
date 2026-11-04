import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Account, Paged } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent or guardian' } as const;
const EMPTY = { role: 'student', firstName: '', lastName: '', email: '', phone: '', admissionNumber: '', staffNumber: '' };
type Notice = { email: string; emailAccepted: boolean; link?: string };

export default function Accounts() {
  const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const qs = new URLSearchParams({ pageSize: '50', ...(role && { role }), ...(status && { status }), ...(q.trim() && { q: q.trim() }) });
  const users = useFetch<Paged<Account>>(`/users?${qs}`);
  const [form, setForm] = useState(EMPTY);
  const create = useAction(); const row = useAction();
  const [notice, setNotice] = useState<Notice | null>(null);

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

        <Card title="New account">
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
        </Card>
      </div>
    </>
  );
}
