import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, DataState, Field, PageHeader, Select, SmallButton, TextArea } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useFetch } from '../../lib/useFetch';

interface Opt { classId: string; className: string; subjectId: string; subjectName: string }
interface QOpt { text: string; isCorrect: boolean }
interface Q { text: string; marks: number; options: QOpt[] }
interface Detail { classId: string; subjectId: string; title: string; instructions: string; opensAt: string | null; closesAt: string; durationMinutes: number | null; maxAttempts: number; showAnswers: boolean; questions: Q[] }
const blank = (): Q => ({ text: '', marks: 1, options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] });
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function QuizEditor() {
  const { id } = useParams(); const nav = useNavigate(); const act = useAction();
  const opts = useFetch<Opt[]>('/quizzes/teacher/options');
  const existing = useFetch<Detail>(id ? `/quizzes/teacher/${id}` : null);
  const [pair, setPair] = useState(''); const [title, setTitle] = useState(''); const [instructions, setInstructions] = useState('');
  const [opens, setOpens] = useState(''); const [closes, setCloses] = useState(''); const [minutes, setMinutes] = useState(''); const [attempts, setAttempts] = useState(1); const [show, setShow] = useState(false);
  const [qs, setQs] = useState<Q[]>([blank()]);
  useEffect(() => {
    const e = existing.data; if (!e) return;
    setPair(`${e.classId}|${e.subjectId}`); setTitle(e.title); setInstructions(e.instructions); setOpens(toLocal(e.opensAt)); setCloses(toLocal(e.closesAt));
    setMinutes(e.durationMinutes ? String(e.durationMinutes) : ''); setAttempts(e.maxAttempts); setShow(e.showAnswers); setQs(e.questions.length ? e.questions : [blank()]);
  }, [existing.data]);

  const setQ = (i: number, f: Partial<Q>) => setQs(qs.map((q, k) => (k === i ? { ...q, ...f } : q)));
  const setO = (qi: number, oi: number, f: Partial<QOpt>) => setQs(qs.map((q, k) => (k !== qi ? q : { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...f } : f.isCorrect ? { ...o, isCorrect: false } : o)) })));

  const save = async () => {
    const [classId, subjectId] = pair.split('|');
    const body = { classId, subjectId, title, instructions, opensAt: opens ? new Date(opens).toISOString() : null, closesAt: new Date(closes).toISOString(), durationMinutes: minutes ? Number(minutes) : null, maxAttempts: attempts, showAnswers: show, questions: qs };
    let newId = id ?? '';
    const ok = await act.run(async () => { const r = await api<{ id: string }>(id ? `/quizzes/teacher/${id}` : '/quizzes/teacher', { method: id ? 'PUT' : 'POST', body }); newId = r.id; });
    if (ok) nav(`/teacher/quizzes/${newId}`);
  };
  const ready = pair && title.trim() && closes;
  return (
    <>
      <PageHeader title={id ? 'Edit quiz' : 'New quiz'} intro="Multiple choice with one correct answer. Marking is automatic." />
      <DataState loading={opts.loading || existing.loading} error={opts.error || existing.error}>
        <div className="space-y-4">
          {act.error && <Alert tone="error">{act.error}</Alert>}
          <Card><div className="space-y-3">
            <Select label="Class and subject" value={pair} onChange={(e) => setPair(e.target.value)}><option value="">Choose…</option>{opts.data?.map((o) => <option key={`${o.classId}|${o.subjectId}`} value={`${o.classId}|${o.subjectId}`}>{o.className} · {o.subjectName}</option>)}</Select>
            <Field label="Title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextArea label="Instructions for students" rows={3} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opens (optional)" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
              <Field label="Closes" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
              <Field label="Time limit in minutes (empty = none)" type="number" min={1} max={300} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <Select label="Attempts allowed" value={String(attempts)} onChange={(e) => setAttempts(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show the correct answers after a student submits</label>
          </div></Card>

          {qs.map((q, qi) => (
            <Card key={qi} title={`Question ${qi + 1}`}><div className="space-y-3">
              <TextArea label="Question" rows={2} maxLength={1000} value={q.text} onChange={(e) => setQ(qi, { text: e.target.value })} />
              <Field label="Marks" type="number" min={0.5} step={0.5} value={q.marks} onChange={(e) => setQ(qi, { marks: Number(e.target.value) })} />
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Options (select the correct one)</legend>
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${qi}`} aria-label={`Option ${oi + 1} is correct`} checked={o.isCorrect} onChange={() => setO(qi, oi, { isCorrect: true })} />
                    <input className="w-full rounded border border-line px-2 py-1 text-sm" aria-label={`Option ${oi + 1}`} maxLength={500} value={o.text} onChange={(e) => setO(qi, oi, { text: e.target.value })} />
                    {q.options.length > 2 && <SmallButton onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi).map((x, j, arr) => (arr.some((y) => y.isCorrect) ? x : { ...x, isCorrect: j === 0 })) })}>Remove</SmallButton>}
                  </div>
                ))}
                {q.options.length < 6 && <SmallButton onClick={() => setQ(qi, { options: [...q.options, { text: '', isCorrect: false }] })}>Add option</SmallButton>}
              </fieldset>
              {qs.length > 1 && <SmallButton onClick={() => setQs(qs.filter((_, k) => k !== qi))}>Remove question</SmallButton>}
            </div></Card>
          ))}
          <div className="flex flex-wrap gap-3">
            {qs.length < 60 && <Button onClick={() => setQs([...qs, blank()])}>Add question</Button>}
            <Button onClick={save} loading={act.busy} disabled={!ready}>Save draft</Button>
          </div>
          <p className="text-xs text-muted">A saved draft is not visible to students. You publish it on the next page, after checking it.</p>
        </div>
      </DataState>
    </>
  );
}
