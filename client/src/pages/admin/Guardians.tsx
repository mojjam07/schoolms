import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Account, GuardianLink, Paged, StudentRow } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export default function Guardians() {
  const links = useFetch<GuardianLink[]>('/parent-links');
  const parents = useFetch<Paged<Account>>('/users?role=parent&pageSize=100');
  const students = useFetch<Paged<StudentRow>>('/students?pageSize=100');
  const [f, setF] = useState({ parentId: '', studentId: '', relationship: 'mother', isPrimary: false });
  const add = useAction(); const del = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await add.run(() => api('/parent-links', { body: f }))) { setF({ ...f, parentId: '', studentId: '', isPrimary: false }); links.reload(); }
  }
  async function remove(l: GuardianLink) {
    if (!window.confirm(`Remove ${l.parentName} as a guardian of ${l.studentName}? They will no longer see this child's records.`)) return;
    if (await del.run(() => api(`/parent-links/${l.parentId}/${l.studentId}`, { method: 'DELETE' }))) links.reload();
  }

  return (
    <>
      <PageHeader title="Guardians" intro="Link parent accounts to their children. Only administrators can change these links, so a parent only ever sees the children linked here." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Linked guardians">
          {del.error && <div className="mb-3"><Alert tone="error">{del.error}</Alert></div>}
          <DataState loading={links.loading} error={links.error}>
            {links.data?.length ? (
              <Table><thead><tr><Th>Student</Th><Th>Guardian</Th><Th>Relationship</Th><Th /></tr></thead>
                <tbody>{links.data.map((l) => (
                  <tr key={`${l.parentId}-${l.studentId}`}>
                    <Td>{l.studentName}</Td><Td><div>{l.parentName}</div><div className="text-muted">{l.parentEmail}</div></Td>
                    <Td className="capitalize">{l.relationship} {l.isPrimary && <Badge tone="good">Primary</Badge>}</Td>
                    <Td className="text-right"><SmallButton tone="danger" onClick={() => remove(l)} disabled={del.busy}>Remove</SmallButton></Td>
                  </tr>
                ))}</tbody></Table>
            ) : <Empty>No guardians are linked yet.</Empty>}
          </DataState>
        </Card>
        <Card title="Link a guardian">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Select label="Student" value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>
              <option value="">Choose a student</option>{students.data?.items.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNumber})</option>)}
            </Select>
            <Select label="Parent or guardian" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
              <option value="">Choose an account</option>{parents.data?.items.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.email})</option>)}
            </Select>
            <Select label="Relationship" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>
              <option value="mother">Mother</option><option value="father">Father</option><option value="guardian">Guardian</option><option value="other">Other</option>
            </Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.isPrimary} onChange={(e) => setF({ ...f, isPrimary: e.target.checked })} />Primary contact for this student</label>
            {add.error && <Alert tone="error">{add.error}</Alert>}
            <Button type="submit" loading={add.busy} disabled={!f.parentId || !f.studentId}>Link guardian</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
