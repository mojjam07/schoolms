import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, DataState, Empty, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fmtDateTime, num, ordinal } from '../../lib/format';
import { messageOf } from '../../lib/forms';
import type { ClassResults, ResultsStatus, Session, Term } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export default function Results() {
  const sessions = useFetch<Session[]>('/academic/sessions'); const termsQ = useFetch<Term[]>('/academic/terms');
  const terms = [...(termsQ.data ?? [])].sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
  const label = (t: Term) => `${sessions.data?.find((s) => s.id === t.sessionId)?.name ?? ''} · ${t.name}`;
  const [pickedTerm, setPickedTerm] = useState(''); const tid = pickedTerm || (terms.find((t) => t.isCurrent) ?? terms[0])?.id || '';
  const status = useFetch<ResultsStatus>(tid ? `/results/status?termId=${tid}` : null);
  const [open, setOpen] = useState('');
  const res = useFetch<ClassResults>(open && tid ? `/results/class?termId=${tid}&classId=${open}` : null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [missing, setMissing] = useState<{ field: string; message: string }[] | null>(null); const [note, setNote] = useState('');

  async function publish(allowIncomplete: boolean, classId: string) {
    setBusy(true); setError(''); setNote(''); if (!allowIncomplete) setMissing(null);
    try { await api('/results/publish', { body: { termId: tid, classId, allowIncomplete } }); setMissing(null); setNote('Results published. Students and parents have been notified.'); status.reload(); res.reload(); }
    catch (e) { if (e instanceof ApiError && e.code === 'INCOMPLETE') { setMissing(e.details ?? []); setError(e.message); } else setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function unpublish(classId: string) {
    if (!window.confirm('Take these results down? Students and parents will no longer see the report cards, and teachers can edit scores again.')) return;
    setBusy(true); setError(''); setNote('');
    try { await api('/results/unpublish', { body: { termId: tid, classId } }); setNote('Results unpublished.'); status.reload(); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  const cls = status.data?.classes.find((c) => c.classId === open);

  return (
    <>
      <PageHeader title="Results" intro="See how far each class has got, check the results, and publish them when they are ready. Students and parents only see published results." />
      {!termsQ.loading && !terms.length ? <Card><Empty>Set up a session and its terms first.</Empty></Card> : (
        <>
          <div className="mb-6 max-w-sm"><Select label="Term" value={tid} onChange={(e) => { setPickedTerm(e.target.value); setOpen(''); setMissing(null); setError(''); setNote(''); }}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select></div>
          {error && <div className="mb-4"><Alert tone="error">{error}{missing && <ul className="mt-2 list-disc pl-5">{missing.map((m) => <li key={m.field}>{m.field}: {m.message}</li>)}</ul>}</Alert>{missing && open && <div className="mt-2"><SmallButton onClick={() => publish(true, open)} disabled={busy}>Publish anyway</SmallButton></div>}</div>}
          {note && <div className="mb-4"><Alert tone="success">{note}</Alert></div>}
          <Card title="Classes">
            <DataState loading={status.loading && !status.data} error={status.error}>
              {status.data?.classes.length ? (
                <Table><thead><tr><Th>Class</Th><Th>Students</Th><Th>Subjects with scores</Th><Th>Scores complete</Th><Th>Status</Th><Th /></tr></thead>
                  <tbody>{status.data.classes.map((c) => (
                    <tr key={c.classId} className={open === c.classId ? 'bg-brand-50' : ''}><Td className="font-medium">{c.className}</Td><Td>{c.students}</Td><Td>{c.subjectsWithScores}</Td>
                      <Td>{c.subjectsWithScores ? `${c.studentsComplete} of ${c.students}` : '-'}{c.studentsIncomplete > 0 && c.subjectsWithScores > 0 && <div className="text-sm text-muted">{c.studentsIncomplete} missing scores</div>}</Td>
                      <Td>{c.publishedAt ? <><Badge tone="good">Published</Badge><div className="text-xs text-muted">{fmtDateTime(c.publishedAt)}</div></> : <Badge tone="neutral">Not published</Badge>}</Td>
                      <Td className="text-right"><SmallButton onClick={() => { setOpen(c.classId); setMissing(null); setError(''); setNote(''); }}>View results</SmallButton></Td></tr>))}</tbody></Table>
              ) : <Empty>No classes have students in this session yet.</Empty>}
            </DataState>
          </Card>
          {open && cls && (
            <div className="mt-6"><Card title={`${cls.className} results`} action={cls.publishedAt ? <SmallButton tone="danger" onClick={() => unpublish(open)} disabled={busy}>Unpublish</SmallButton> : <SmallButton onClick={() => publish(false, open)} disabled={busy || !cls.subjectsWithScores}>Publish results</SmallButton>}>
              <DataState loading={res.loading && !res.data} error={res.error}>
                {res.data && (res.data.subjects.length ? (
                  <Table><thead><tr><Th>Student</Th>{res.data.subjects.map((s) => <Th key={s.id}>{s.name}</Th>)}<Th>Average</Th><Th>Position</Th><Th /></tr></thead>
                    <tbody>{res.data.students.map((s) => (
                      <tr key={s.studentId}><Td><div className="font-medium">{s.name}</div><div className="text-muted">{s.admissionNumber}</div></Td>
                        {s.subjects.map((x) => <Td key={x.subjectId}>{x.complete ? <>{num(x.percent)}% <Badge tone="neutral">{x.grade}</Badge></> : <span className="text-red-700">missing</span>}</Td>)}
                        <Td>{s.ranked ? <>{num(s.average)}% <Badge tone="good">{s.grade}</Badge></> : <span className="text-muted">Not ranked</span>}</Td><Td>{s.ranked ? `${ordinal(s.position)} of ${res.data!.rankedCount}` : '-'}</Td>
                        <Td className="text-right"><Link className="font-medium text-brand-700 underline" to={`/admin/results/${tid}/${s.studentId}`}>Report card</Link></Td></tr>))}</tbody></Table>
                ) : <Empty>No scores have been entered for this class and term yet. Teachers enter them under Scores.</Empty>)}
              </DataState>
              <p className="mt-3 text-sm text-muted">A student is ranked only when every subject that has scores for this class is complete. Positions use the average percentage; equal averages share a place.</p>
            </Card></div>
          )}
        </>
      )}
    </>
  );
}
