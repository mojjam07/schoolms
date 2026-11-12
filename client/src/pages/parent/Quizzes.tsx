import { useState } from 'react';
import { Badge, Card, DataState, Empty, PageHeader } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';

interface Quiz { id: string; title: string; subject: string; closesAt: string; attemptsUsed: number; maxAttempts: number; best: number | null; maxScore: number | null; state: string }

export default function ParentQuizzes() {
  const d = useFetch<{ studentId: string; name: string; quizzes: Quiz[] }[]>('/quizzes/parent');
  const [pick, setPick] = useState<string | null>(null);
  const child = d.data?.find((c) => c.studentId === pick) ?? d.data?.[0];
  return (
    <>
      <PageHeader title="Quizzes" intro="Quizzes your children have been set, and how they did." />
      <DataState loading={d.loading} error={d.error}>
        {d.data && d.data.length === 0 ? <Empty>No children are linked to your account yet.</Empty> : child && (
          <>
            {d.data!.length > 1 && <div role="tablist" aria-label="Choose a child" className="mb-4 flex flex-wrap gap-2">{d.data!.map((c) => <button key={c.studentId} role="tab" aria-selected={c.studentId === child.studentId} onClick={() => setPick(c.studentId)} className={`rounded-full border px-4 py-1.5 text-sm ${c.studentId === child.studentId ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white'}`}>{c.name}</button>)}</div>}
            {child.quizzes.length === 0 ? <Empty>No quizzes for {child.name} yet.</Empty> : (
              <ul className="space-y-2">{child.quizzes.map((q) => (
                <li key={q.id}><Card>
                  <div className="flex flex-wrap items-center justify-between gap-2"><b>{q.title}</b><Badge tone={q.best !== null ? 'good' : 'warn'}>{q.best !== null ? `${q.best} / ${q.maxScore}` : q.state === 'closed' ? 'not taken' : 'not yet taken'}</Badge></div>
                  <p className="text-sm text-muted">{q.subject} · closes {fmtDateTime(q.closesAt)} · {q.attemptsUsed} of {q.maxAttempts} attempt{q.maxAttempts === 1 ? '' : 's'} used</p>
                </Card></li>
              ))}</ul>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
