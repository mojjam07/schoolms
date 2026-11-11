import { useState } from 'react';
import { Badge, Card, DataState, Empty, PageHeader, Select } from '../../components/ui';
import { dueText, fmtDateTime } from '../../lib/format';
import type { Child, StudentAssignmentRow } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';
import { StatusBadge } from '../student/Assignments';

export default function ParentAssignments() {
  const kids = useFetch<Child[]>('/parents/me/children');
  const [picked, setPicked] = useState('');
  const child = kids.data?.find((k) => k.id === picked) ?? kids.data?.[0];
  const list = useFetch<StudentAssignmentRow[]>(child ? `/parents/me/children/${child.id}/assignments` : null);
  const open = list.data?.filter((a) => a.myStatus === 'not_submitted' && a.status === 'published') ?? [];
  const rest = list.data?.filter((a) => !open.includes(a)) ?? [];
  const Row = ({ a }: { a: StudentAssignmentRow }) => (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-medium">{a.title}</p><p className="text-sm text-muted">{a.subjectName} · {a.teacherName}</p></div>
        <StatusBadge a={a} />
      </div>
      <p className="mt-2 text-sm text-muted">Due {fmtDateTime(a.dueAt)}{a.myStatus === 'not_submitted' && a.status === 'published' && <> · <span className={a.overdue ? 'font-medium text-red-700' : ''}>{dueText(a.dueAt)}</span></>}</p>
    </li>
  );
  return (
    <>
      <PageHeader title="Assignments" intro="Work set for your child's class, with deadlines and whether it has been handed in." />
      <DataState loading={kids.loading} error={kids.error}>
        {child ? (
          <>
            {kids.data && kids.data.length > 1 && <div className="mb-4 max-w-xs"><Select label="Child" value={child.id} onChange={(e) => setPicked(e.target.value)}>{kids.data.map((k) => <option key={k.id} value={k.id}>{k.firstName} {k.lastName}</option>)}</Select></div>}
            <DataState loading={list.loading && !list.data} error={list.error}>
              {list.data?.length ? (
                <div className="space-y-8">
                  {open.length > 0 && <section><h2 className="mb-3 font-display text-2xl font-bold">Not handed in yet <Badge tone="warn">{open.length}</Badge></h2><ul className="space-y-3">{open.map((a) => <Row key={a.id} a={a} />)}</ul></section>}
                  {rest.length > 0 && <section><h2 className="mb-3 font-display text-2xl font-bold">Handed in and earlier work</h2><ul className="space-y-3">{rest.map((a) => <Row key={a.id} a={a} />)}</ul></section>}
                </div>
              ) : <Card><Empty>No assignments have been set for this class yet.</Empty></Card>}
            </DataState>
          </>
        ) : <Card><Empty>No children are linked to your account yet.</Empty></Card>}
      </DataState>
    </>
  );
}
