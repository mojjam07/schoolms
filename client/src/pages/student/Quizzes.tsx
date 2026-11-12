import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction, useFetch } from '../../lib/useFetch';

interface Row { id: string; title: string; subject: string; questions: number; closesAt: string; durationMinutes: number | null; maxAttempts: number; attemptsUsed: number; best: number | null; maxScore: number | null; openAttemptId: string | null; state: 'open' | 'in_progress' | 'finished' | 'closed' }

export default function StudentQuizzes() {
  const d = useFetch<Row[]>('/quizzes/student'); const nav = useNavigate(); const act = useAction();
  const start = async (q: Row) => {
    let attemptId = q.openAttemptId ?? '';
    if (!attemptId) { const ok = await act.run(async () => { attemptId = (await api<{ attemptId: string }>(`/quizzes/student/${q.id}/start`, { body: {} })).attemptId; }); if (!ok) return; }
    nav(`/student/quizzes/attempt/${attemptId}`);
  };
  return (
    <>
      <PageHeader title="Quizzes" intro="Quizzes set by your teachers." />
      {act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}
      <DataState loading={d.loading} error={d.error}>
        {d.data && d.data.length === 0 ? <Empty>No quizzes yet.</Empty> : (
          <ul className="space-y-2">{d.data?.map((q) => (
            <li key={q.id}><Card>
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{q.title}</b><Badge tone={q.state === 'open' || q.state === 'in_progress' ? 'good' : undefined}>{q.state === 'in_progress' ? 'in progress' : q.state}</Badge></div>
              <p className="text-sm text-muted">{q.subject} · {q.questions} question{q.questions === 1 ? '' : 's'} · {q.durationMinutes ? `${q.durationMinutes} minutes` : 'no time limit'} · closes {fmtDateTime(q.closesAt)} · attempt {Math.min(q.attemptsUsed + (q.state === 'open' ? 1 : 0), q.maxAttempts)} of {q.maxAttempts}</p>
              {q.best !== null && <p className="text-sm">Best score <b>{q.best} / {q.maxScore}</b></p>}
              {(q.state === 'open' || q.state === 'in_progress') && <div className="mt-2"><Button onClick={() => start(q)} loading={act.busy}>{q.state === 'in_progress' ? 'Continue' : 'Start quiz'}</Button></div>}
            </Card></li>
          ))}</ul>
        )}
      </DataState>
    </>
  );
}
