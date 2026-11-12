import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction, useFetch } from '../../lib/useFetch';

interface Detail {
  id: string; title: string; status: 'draft' | 'published' | 'closed'; closesAt: string; opensAt: string | null; durationMinutes: number | null; maxAttempts: number; showAnswers: boolean;
  questions: { id: string; text: string; marks: number; options: { id: string; text: string; isCorrect: boolean }[] }[];
  results: { studentId: string; name: string; attempts: number; best: number | null; maxScore: number | null; lastAt: string | null }[];
}

export default function QuizDetail() {
  const { id } = useParams(); const nav = useNavigate(); const d = useFetch<Detail>(`/quizzes/teacher/${id}`); const act = useAction();
  const run = async (path: string, method = 'POST') => { if (await act.run(() => api(`/quizzes/teacher/${id}${path}`, { method, body: method === 'POST' ? {} : undefined }))) d.reload(); };
  const remove = async () => { if (window.confirm('Delete this draft?') && await act.run(() => api(`/quizzes/teacher/${id}`, { method: 'DELETE' }))) nav('/teacher/quizzes'); };
  return (
    <>
      <p className="mb-2 text-sm"><Link className="text-brand-700 underline" to="/teacher/quizzes">← All quizzes</Link></p>
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <>
            <PageHeader title={d.data.title} intro={`Closes ${fmtDateTime(d.data.closesAt)} · ${d.data.durationMinutes ? `${d.data.durationMinutes} minutes` : 'no time limit'} · ${d.data.maxAttempts} attempt${d.data.maxAttempts === 1 ? '' : 's'}`} />
            {act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Badge tone={d.data.status === 'published' ? 'good' : d.data.status === 'draft' ? 'warn' : undefined}>{d.data.status}</Badge>
              {d.data.status === 'draft' && <><Link to={`/teacher/quizzes/${id}/edit`} className="rounded-lg border border-line px-3 py-1.5 text-sm">Edit</Link><Button onClick={() => run('/publish')} loading={act.busy}>Publish to the class</Button><Button onClick={remove}>Delete draft</Button></>}
              {d.data.status === 'published' && <Button onClick={() => { if (window.confirm('Close now? Anyone still taking it is submitted with their answers so far.')) run('/close'); }} loading={act.busy}>Close now</Button>}
            </div>

            <Card title="Questions">
              <ol className="space-y-4 text-sm">{d.data.questions.map((q) => (
                <li key={q.id}><p className="font-medium">{q.text} <span className="text-muted">({q.marks} mark{q.marks === 1 ? '' : 's'})</span></p>
                  <ul className="ml-4 list-disc">{q.options.map((o) => <li key={o.id} className={o.isCorrect ? 'font-semibold text-green-800' : ''}>{o.text}{o.isCorrect ? ' ✓' : ''}</li>)}</ul></li>
              ))}</ol>
            </Card>

            {d.data.status !== 'draft' && (
              <div className="mt-4"><Card title="Results (best attempt)">
                {d.data.results.length === 0 ? <Empty>No students are enrolled in this class.</Empty> : (
                  <table className="w-full text-sm"><caption className="sr-only">Results by student</caption>
                    <thead><tr><th scope="col" className="py-1 text-left">Student</th><th scope="col" className="text-right">Attempts</th><th scope="col" className="text-right">Best score</th></tr></thead>
                    <tbody>{d.data.results.map((r) => <tr key={r.studentId} className="border-t border-line"><th scope="row" className="py-1 text-left font-normal">{r.name}</th><td className="text-right">{r.attempts}</td><td className="text-right">{r.best !== null ? `${r.best} / ${r.maxScore}` : <span className="text-muted">not taken</span>}</td></tr>)}</tbody>
                  </table>
                )}
              </Card></div>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
