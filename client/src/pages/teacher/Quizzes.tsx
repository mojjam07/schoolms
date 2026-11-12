import { Link } from 'react-router-dom';
import { Badge, Card, DataState, Empty, PageHeader } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';

interface Row { id: string; title: string; status: string; className: string; subject: string; closesAt: string; questions: number; takers: number; averagePercent: number | null }

export default function TeacherQuizzes() {
  const d = useFetch<Row[]>('/quizzes/teacher');
  return (
    <>
      <PageHeader title="Quizzes" intro="Auto-marked quizzes for the classes you teach." />
      <p className="mb-4"><Link to="/teacher/quizzes/new" className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white">New quiz</Link></p>
      <DataState loading={d.loading} error={d.error}>
        {d.data && d.data.length === 0 ? <Empty>You have not made any quizzes yet.</Empty> : (
          <ul className="space-y-2">{d.data?.map((q) => (
            <li key={q.id}><Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="font-medium text-brand-700 underline" to={`/teacher/quizzes/${q.id}`}>{q.title}</Link>
                <Badge tone={q.status === 'published' ? 'good' : q.status === 'draft' ? 'warn' : undefined}>{q.status}</Badge>
              </div>
              <p className="text-sm text-muted">{q.className} · {q.subject} · {q.questions} question{q.questions === 1 ? '' : 's'} · closes {fmtDateTime(q.closesAt)}</p>
              {q.status !== 'draft' && <p className="text-sm">{q.takers} student{q.takers === 1 ? '' : 's'} took it{q.averagePercent !== null ? ` · average ${q.averagePercent}%` : ''}</p>}
            </Card></li>
          ))}</ul>
        )}
      </DataState>
    </>
  );
}
