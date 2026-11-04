import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, PageHeader, Select } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { gradeFor, num } from '../../lib/format';
import { messageOf } from '../../lib/forms';
import type { ScoreSheet, Session, TeacherAssignment, Term } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

const valid = (t: string, max: number) => t.trim() === '' || (/^\d+(\.\d{1,2})?$/.test(t.trim()) && Number(t) <= max);

export default function Scores() {
  const mine = useFetch<TeacherAssignment[]>('/teachers/me/assignments');
  const sessions = useFetch<Session[]>('/academic/sessions'); const termsQ = useFetch<Term[]>('/academic/terms');
  const current = sessions.data?.find((s) => s.isCurrent);
  const terms = (termsQ.data ?? []).filter((t) => t.sessionId === current?.id).sort((a, b) => a.termNumber - b.termNumber);
  const [termPick, setTermPick] = useState(''); const tid = termPick || (terms.find((t) => t.isCurrent) ?? terms[0])?.id || '';
  const [pair, setPair] = useState(''); const pairId = pair || (mine.data?.[0] ? `${mine.data[0].classId}|${mine.data[0].subjectId}` : '');
  const [classId, subjectId] = pairId.split('|');
  const sheet = useFetch<ScoreSheet>(tid && classId && subjectId ? `/results/sheet?termId=${tid}&classId=${classId}&subjectId=${subjectId}` : null);
  const [cells, setCells] = useState<Record<string, string>>({}); const [saving, setSaving] = useState(false); const [errors, setErrors] = useState<string[]>([]); const [msg, setMsg] = useState('');
  const key = (s: string, c: string) => `${s}|${c}`;
  const s = sheet.data;
  useEffect(() => { if (!s) return; const m: Record<string, string> = {}; s.students.forEach((st) => s.components.forEach((c) => { const v = st.scores[c.id]; m[key(st.studentId, c.id)] = v === null ? '' : String(v); })); setCells(m); }, [s]);

  const changed = useMemo(() => {
    if (!s) return [];
    return s.students.flatMap((st) => s.components.flatMap((c) => {
      const now = (cells[key(st.studentId, c.id)] ?? '').trim(); const before = st.scores[c.id] === null ? '' : String(st.scores[c.id]);
      return now !== before ? [{ studentId: st.studentId, componentId: c.id, score: now === '' ? null : Number(now) }] : [];
    }));
  }, [cells, s]);
  const anyInvalid = !!s && s.students.some((st) => s.components.some((c) => !valid(cells[key(st.studentId, c.id)] ?? '', c.maxScore)));

  async function save() {
    setSaving(true); setErrors([]); setMsg('');
    try { await api('/results/sheet', { method: 'PUT', body: { termId: tid, classId, subjectId, entries: changed } }); setMsg(`Saved ${changed.length} change${changed.length === 1 ? '' : 's'}.`); sheet.reload(); }
    catch (e) { setErrors(e instanceof ApiError && e.details?.length ? e.details.map((d) => d.message) : [messageOf(e)]); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHeader title="Scores" intro="Enter each student's scores for your subject. Totals and grades work themselves out. Nothing is lost if you leave a box empty: you can come back." />
      {!mine.loading && !mine.data?.length ? <Card><Empty>You have not been assigned any classes yet.</Empty></Card> : (
        <>
          <div className="mb-6 grid gap-4 sm:max-w-2xl sm:grid-cols-2">
            <Select label="Class and subject" value={pairId} onChange={(e) => { setPair(e.target.value); setMsg(''); setErrors([]); }}>{mine.data?.map((a) => <option key={a.id} value={`${a.classId}|${a.subjectId}`}>{a.className} · {a.subjectName}</option>)}</Select>
            <Select label="Term" value={tid} onChange={(e) => { setTermPick(e.target.value); setMsg(''); setErrors([]); }}>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </div>
          <DataState loading={sheet.loading && !s} error={sheet.error}>
            {s && (
              <Card title={`${s.className} · ${s.subjectName} · ${s.term.name}`}>
                {s.locked && <div className="mb-4"><Alert tone="error">These results have been published, so scores are locked. Ask the administrator if something needs correcting.</Alert></div>}
                {s.published && !s.locked && <div className="mb-4"><Alert tone="error">These results are published. Changes you save here are recorded and show on report cards straight away.</Alert></div>}
                {s.students.length ? (
                  <div className="overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                    <thead><tr className="bg-brand-50"><th className="border border-line px-2 py-2">Student</th>{s.components.map((c) => <th key={c.id} className="border border-line px-2 py-2 text-center">{c.name}<div className="text-xs font-normal text-muted">out of {c.maxScore}</div></th>)}<th className="border border-line px-2 py-2 text-center">Total<div className="text-xs font-normal text-muted">out of {s.maxTotal}</div></th><th className="border border-line px-2 py-2 text-center">Grade</th></tr></thead>
                    <tbody>{s.students.map((st) => {
                      const vals = s.components.map((c) => (cells[key(st.studentId, c.id)] ?? '').trim());
                      const done = vals.every((v) => v !== '') && !anyInvalid; const total = done ? Math.round(vals.reduce((t, v) => t + Number(v), 0) * 100) / 100 : null;
                      return (
                        <tr key={st.studentId}><td className="border border-line px-2 py-1.5"><div className="font-medium">{st.name}</div><div className="text-xs text-muted">{st.admissionNumber}</div></td>
                          {s.components.map((c) => { const v = cells[key(st.studentId, c.id)] ?? ''; const ok = valid(v, c.maxScore);
                            return <td key={c.id} className="border border-line p-1"><input aria-label={`${st.name}, ${c.name}`} aria-invalid={!ok} inputMode="decimal" disabled={s.locked} value={v}
                              onChange={(e) => { setMsg(''); setCells({ ...cells, [key(st.studentId, c.id)]: e.target.value }); }} className={`w-full min-w-[4.5rem] rounded border px-2 py-1.5 text-center ${ok ? 'border-line' : 'border-red-600 bg-red-50'} disabled:bg-gray-100`} /></td>; })}
                          <td className="border border-line px-2 py-1.5 text-center font-semibold">{total === null ? '-' : num(total)}</td>
                          <td className="border border-line px-2 py-1.5 text-center">{total === null ? '-' : <Badge tone="neutral">{gradeFor(s.bands, (total / s.maxTotal) * 100) ?? '-'}</Badge>}</td></tr>);
                    })}</tbody></table></div>
                ) : <Empty>No students are in this class yet.</Empty>}
                {anyInvalid && <p className="mt-3 text-sm text-red-700">A highlighted score is not valid: use a number from 0 up to the column's maximum, with at most 2 decimals.</p>}
                {errors.length > 0 && <div className="mt-4"><Alert tone="error">Nothing was saved. <ul className="mt-1 list-disc pl-5">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul></Alert></div>}
                {msg && <div className="mt-4"><Alert tone="success">{msg}</Alert></div>}
                {!s.locked && s.students.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-4"><div className="w-44"><Button onClick={save} loading={saving} disabled={!changed.length || anyInvalid}>Save scores</Button></div>{changed.length > 0 && <span className="text-sm text-muted">{changed.length} unsaved change{changed.length === 1 ? '' : 's'}</span>}</div>}
              </Card>
            )}
          </DataState>
        </>
      )}
    </>
  );
}
