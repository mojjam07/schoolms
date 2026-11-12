import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, DataState, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useFetch } from '../../lib/useFetch';

interface Opt { id: string; text: string; isCorrect?: boolean }
interface Q { id: string; text: string; marks: number; chosenOptionId: string | null; options: Opt[] }
type Attempt = { attemptId: string; title: string; deadlineAt: string; serverNow: string } & (
  | { status: 'in_progress'; questions: Q[] }
  | { status: 'submitted'; score: number; maxScore: number; autoSubmitted: boolean; review: Q[] | null });

export default function TakeQuiz() {
  const { attemptId } = useParams(); const d = useFetch<Attempt>(`/quizzes/attempts/${attemptId}`);
  const save = useAction(); const send = useAction();
  const [chosen, setChosen] = useState<Record<string, string | null>>({}); const [left, setLeft] = useState<number | null>(null); const [result, setResult] = useState<Attempt | null>(null);
  const submitted = useRef(false);

  useEffect(() => { if (d.data?.status === 'in_progress') setChosen(Object.fromEntries(d.data.questions.map((q) => [q.id, q.chosenOptionId]))); }, [d.data]);

  const doSubmit = useCallback(async () => {
    if (submitted.current) return; submitted.current = true;
    const answers = Object.entries(chosen).map(([questionId, optionId]) => ({ questionId, optionId }));
    let r: Attempt | null = null;
    const ok = await send.run(async () => { r = await api<Attempt>(`/quizzes/attempts/${attemptId}/submit`, { body: { answers } }); });
    if (ok && r) setResult(r); else submitted.current = false;
  }, [chosen, attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown against the server's clock (the deadline is always enforced on the server too).
  useEffect(() => {
    if (d.data?.status !== 'in_progress') return;
    const skew = new Date(d.data.serverNow).getTime() - Date.now(); const end = new Date(d.data.deadlineAt).getTime();
    const tick = () => { const s = Math.max(0, Math.round((end - (Date.now() + skew)) / 1000)); setLeft(s); if (s === 0) doSubmit(); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [d.data, doSubmit]);

  const pick = async (qid: string, oid: string) => {
    setChosen((c) => ({ ...c, [qid]: oid }));
    await save.run(() => api(`/quizzes/attempts/${attemptId}/answers`, { method: 'PUT', body: { answers: [{ questionId: qid, optionId: oid }] } }));
  };

  const view = result ?? d.data;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <>
      <p className="mb-2 text-sm"><Link className="text-brand-700 underline" to="/student/quizzes">← All quizzes</Link></p>
      <DataState loading={d.loading} error={d.error}>
        {view && view.status === 'in_progress' && (
          <>
            <PageHeader title={view.title} intro="Choose one answer for each question. Your answers are saved as you go." />
            {left !== null && <p role="timer" aria-live="off" className={`sticky top-0 z-10 mb-4 rounded-lg border border-line bg-white p-2 text-center font-semibold ${left < 60 ? 'text-red-700' : ''}`}>Time left: {mmss(left)}</p>}
            {(save.error || send.error) && <div className="mb-3"><Alert tone="error">{save.error || send.error}</Alert></div>}
            <ol className="space-y-4">{view.questions.map((q, i) => (
              <li key={q.id}><Card><fieldset>
                <legend className="mb-2 font-medium">{i + 1}. {q.text} <span className="text-sm font-normal text-muted">({q.marks} mark{q.marks === 1 ? '' : 's'})</span></legend>
                <div className="space-y-2">{q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm"><input type="radio" name={q.id} checked={chosen[q.id] === o.id} onChange={() => pick(q.id, o.id)} /> {o.text}</label>
                ))}</div>
              </fieldset></Card></li>
            ))}</ol>
            <div className="mt-4"><Button onClick={() => { if (window.confirm('Submit your answers now?')) doSubmit(); }} loading={send.busy}>Submit quiz</Button></div>
          </>
        )}
        {view && view.status === 'submitted' && (
          <>
            <PageHeader title={view.title} intro="Your result" />
            <Card><p className="text-3xl font-semibold">{view.score} / {view.maxScore}</p>{view.autoSubmitted && <p className="mt-1 text-sm text-muted">Time ran out, so your answers so far were submitted.</p>}</Card>
            {view.review && (
              <ol className="mt-4 space-y-4">{view.review.map((q, i) => (
                <li key={q.id}><Card><p className="mb-2 font-medium">{i + 1}. {q.text}</p>
                  <ul className="space-y-1 text-sm">{q.options.map((o) => <li key={o.id} className={o.isCorrect ? 'font-semibold text-green-800' : q.chosenOptionId === o.id ? 'text-red-700' : ''}>{o.text}{o.isCorrect ? ' ✓ correct' : q.chosenOptionId === o.id ? ' ✗ your answer' : ''}{o.isCorrect && q.chosenOptionId === o.id ? ' (your answer)' : ''}</li>)}</ul></Card></li>
              ))}</ol>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
