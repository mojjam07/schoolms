import { useState } from 'react';
import { Alert, Badge, Card, DataState, Empty, Field, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Paged, SchoolClass, Session, StudentRow } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export default function Students() {
  const [q, setQ] = useState(''); const [classFilter, setClassFilter] = useState('');
  const sessions = useFetch<Session[]>('/academic/sessions');
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const current = sessions.data?.find((s) => s.isCurrent);
  const qs = new URLSearchParams({ pageSize: '100', ...(q.trim() && { q: q.trim() }), ...(classFilter && { classId: classFilter }) });
  const students = useFetch<Paged<StudentRow>>(`/students?${qs}`);
  const action = useAction();

  async function setClass(s: StudentRow, classId: string) {
    if (!classId || !current) return;
    if (await action.run(() => api('/academic/enrolments', { body: { studentId: s.id, classId, sessionId: current.id } }))) students.reload();
  }

  return (
    <>
      <PageHeader title="Students and classes" intro={current ? `Placing students in classes for ${current.name}. Choosing a different class moves the student.` : 'Students and their classes for the current session.'} />
      {!sessions.loading && !current && <div className="mb-4"><Alert tone="error">No session is current. Set one under Sessions and terms before placing students in classes.</Alert></div>}
      {action.error && <div className="mb-4"><Alert tone="error">{action.error}</Alert></div>}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Field label="Search" placeholder="Name, admission number or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select label="Class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <DataState loading={students.loading} error={students.error}>
          {students.data?.items.length ? (
            <Table>
              <thead><tr><Th>Student</Th><Th>Admission no.</Th><Th>Class this session</Th><Th>Set class</Th></tr></thead>
              <tbody>
                {students.data.items.map((s) => (
                  <tr key={s.id}>
                    <Td><div className="font-medium">{s.firstName} {s.lastName}</div>{s.accountStatus !== 'active' && <Badge tone="warn">{s.accountStatus === 'pending' ? 'Not activated' : 'Suspended'}</Badge>}</Td>
                    <Td>{s.admissionNumber}</Td>
                    <Td>{s.className ?? <span className="text-muted">Not placed</span>}</Td>
                    <Td>
                      <select aria-label={`Set class for ${s.firstName} ${s.lastName}`} value="" disabled={!current || action.busy}
                        onChange={(e) => setClass(s, e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 text-sm">
                        <option value="">Choose…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No students found. Create student accounts under Accounts.</Empty>}
          {students.data && students.data.total > students.data.items.length && <p className="mt-3 text-sm text-muted">Showing {students.data.items.length} of {students.data.total}. Search to find others.</p>}
        </DataState>
      </Card>
    </>
  );
}
