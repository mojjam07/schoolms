import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, DataState, Empty, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Account, Assignment, Paged, SchoolClass, Session, Subject } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export default function Teaching() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const current = sessions.data?.find((s) => s.isCurrent);
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const teachers = useFetch<Paged<Account>>('/users?role=teacher&pageSize=100');
  const [classId, setClassId] = useState(''); const [subjectId, setSubjectId] = useState(''); const [teacherId, setTeacherId] = useState('');
  const classSubjects = useFetch<Subject[]>(classId ? `/academic/classes/${classId}/subjects` : null);
  const list = useFetch<Assignment[]>(current ? `/academic/teaching-assignments?sessionId=${current.id}` : null);
  const add = useAction(); const del = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await add.run(() => api('/academic/teaching-assignments', { body: { sessionId: current.id, classId, subjectId, teacherId } }))) { setSubjectId(''); list.reload(); }
  }
  async function remove(id: string) { if (await del.run(() => api(`/academic/teaching-assignments/${id}`, { method: 'DELETE' }))) list.reload(); }

  return (
    <>
      <PageHeader title="Teaching assignments" intro={current ? `Who teaches what in ${current.name}. A subject must first be added to the class under Classes and subjects.` : 'Who teaches what in the current session.'} />
      {!sessions.loading && !current && <div className="mb-4"><Alert tone="error">No session is current. Set one under Sessions and terms first.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Current assignments">
          {del.error && <div className="mb-3"><Alert tone="error">{del.error}</Alert></div>}
          <DataState loading={list.loading} error={list.error}>
            {list.data?.length ? (
              <Table><thead><tr><Th>Class</Th><Th>Subject</Th><Th>Teacher</Th><Th /></tr></thead>
                <tbody>{list.data.map((a) => (
                  <tr key={a.id}><Td>{a.className}</Td><Td>{a.subjectName}</Td><Td>{a.teacherName}{a.staffNumber && <span className="text-muted"> ({a.staffNumber})</span>}</Td>
                    <Td className="text-right"><SmallButton tone="danger" onClick={() => remove(a.id)} disabled={del.busy}>Remove</SmallButton></Td></tr>
                ))}</tbody></Table>
            ) : <Empty>{current ? 'No assignments yet.' : 'Nothing to show until a session is current.'}</Empty>}
          </DataState>
        </Card>
        <Card title="Assign a teacher">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Select label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(''); }}>
              <option value="">Choose a class</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
              <option value="">{classId && !classSubjects.data?.length ? 'This class has no subjects yet' : 'Choose a subject'}</option>
              {classSubjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Choose a teacher</option>{teachers.data?.items.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
            </Select>
            {add.error && <Alert tone="error">{add.error}</Alert>}
            <Button type="submit" loading={add.busy} disabled={!current || !classId || !subjectId || !teacherId}>Assign teacher</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
