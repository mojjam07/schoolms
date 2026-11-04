import { Link } from 'react-router-dom';
import { Badge, Card, DataState, Empty, PageHeader } from '../../components/ui';
import { dueText, fmtDateTime } from '../../lib/format';
import type { StudentAssignmentRow } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export function StatusBadge({ a }: { a: StudentAssignmentRow }) {
  if (a.myStatus === 'returned') return <Badge tone="good">Marked: {a.myMarks} / {a.maxMarks}</Badge>;
  if (a.myStatus === 'submitted') return <Badge tone="neutral">Handed in{a.myIsLate ? ' (late)' : ''}, awaiting marks</Badge>;
  if (a.status === 'closed') return <Badge tone="bad">Closed, not handed in</Badge>;
  if (a.overdue) return <Badge tone="bad">Overdue</Badge>;
  return <Badge tone="warn">Not handed in</Badge>;
}

export default function Assignments() {
  const list = useFetch<StudentAssignmentRow[]>('/students/me/assignments');
  const todo = list.data?.filter((a) => a.myStatus === 'not_submitted' && a.status === 'published') ?? [];
  const rest = list.data?.filter((a) => !todo.includes(a)) ?? [];
  const Item = ({ a }: { a: StudentAssignmentRow }) => (
    <li>
      <Link to={`/student/assignments/${a.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-brand-500">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-medium">{a.title}</p><p className="text-sm text-muted">{a.subjectName} · {a.teacherName}</p></div>
          <StatusBadge a={a} />
        </div>
        <p className="mt-2 text-sm text-muted">Due {fmtDateTime(a.dueAt)}{a.myStatus === 'not_submitted' && a.status === 'published' && <> · <span className={a.overdue ? 'font-medium text-red-700' : ''}>{dueText(a.dueAt)}</span></>}</p>
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader title="Assignments" intro="Work set by your teachers. Open one to read the instructions and hand in your answer." />
      <DataState loading={list.loading} error={list.error}>
        {list.data?.length ? (
          <div className="space-y-8">
            {todo.length > 0 && <section><h2 className="mb-3 font-display text-2xl font-bold">To do</h2><ul className="space-y-3">{todo.map((a) => <Item key={a.id} a={a} />)}</ul></section>}
            {rest.length > 0 && <section><h2 className="mb-3 font-display text-2xl font-bold">{todo.length ? 'Handed in and earlier work' : 'Your assignments'}</h2><ul className="space-y-3">{rest.map((a) => <Item key={a.id} a={a} />)}</ul></section>}
          </div>
        ) : <Card><Empty>No assignments have been set for your class yet. When a teacher publishes one, it will appear here.</Empty></Card>}
      </DataState>
    </>
  );
}
