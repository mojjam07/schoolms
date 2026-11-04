import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { FileList } from '../../components/FileList';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { AssignmentFull, Attempt, RosterRow } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';
import { STATUS_BADGE } from './Assignments';

const ROW_BADGE = { not_submitted: ['Not handed in', 'neutral'], submitted: ['To mark', 'warn'], graded: ['Marked, not returned', 'warn'], returned: ['Returned', 'good'] } as const;

function Marking({ assignment, studentId, onSaved }: { assignment: AssignmentFull; studentId: string; onSaved: () => void }) {
  const data = useFetch<{ studentName: string; attempts: Attempt[] }>(`/assignments/${assignment.id}/students/${studentId}/submission`);
  const [marks, setMarks] = useState(''); const [feedback, setFeedback] = useState(''); const [saved, setSaved] = useState('');
  const act = useAction();
  const attempts = data.data?.attempts ?? []; const latest = attempts[attempts.length - 1];

  // Re-sync the fields from the server after a save, but keep the "saved" message on screen.
  useEffect(() => { setMarks(latest?.marks != null ? String(latest.marks) : ''); setFeedback(latest?.feedback ?? ''); }, [latest?.id, latest?.marks, latest?.feedback]);

  async function save(returnToStudent: boolean, e?: FormEvent) {
    e?.preventDefault(); setSaved('');
    if (await act.run(() => api(`/submissions/${latest!.id}/grade`, { method: 'PUT', body: { marks: Number(marks), feedback, returnToStudent } }))) {
      setSaved(returnToStudent ? 'Marks saved and returned to the student.' : 'Marks saved. The student cannot see them until you return the work.'); data.reload(); onSaved();
    }
  }

  return (
    <Card title={data.data ? `Work from ${data.data.studentName}` : 'Student work'}>
      <DataState loading={data.loading} error={data.error}>
        {!latest ? <Empty>This student has not handed in any work yet.</Empty> : (
          <div className="space-y-6">
            {attempts.slice(0, -1).map((a) => (
              <div key={a.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-medium">Attempt {a.attempt} <span className="font-normal text-muted">· {fmtDateTime(a.submittedAt)} · marked {a.marks ?? '-'} / {assignment.maxMarks}</span></p>
                {a.textResponse && <p className="mt-1 whitespace-pre-wrap break-words text-muted">{a.textResponse}</p>}
              </div>
            ))}
            <div>
              <p className="mb-2 font-medium">
                {attempts.length > 1 ? `Attempt ${latest.attempt} (latest)` : 'Submission'} <span className="font-normal text-muted">· handed in {fmtDateTime(latest.submittedAt)}</span> {latest.isLate && <Badge tone="bad">Late</Badge>}
              </p>
              {latest.textResponse ? <p className="whitespace-pre-wrap break-words rounded-lg bg-brand-50 p-3">{latest.textResponse}</p> : <p className="text-sm text-muted">No written answer.</p>}
              {latest.files.length > 0 && <div className="mt-3"><FileList files={latest.files} /></div>}
            </div>
            <form onSubmit={(e) => save(false, e)} className="grid gap-4 border-t border-line pt-5 lg:max-w-xl" noValidate>
              <Field label={`Marks (out of ${assignment.maxMarks})`} type="number" min="0" max={assignment.maxMarks} step="0.5" value={marks} error={act.fields.marks} onChange={(e) => setMarks(e.target.value)} />
              <TextArea label="Feedback for the student" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              {act.error && !act.fields.marks && <Alert tone="error">{act.error}</Alert>}
              {saved && <Alert tone="success">{saved}</Alert>}
              <div className="flex flex-wrap gap-3">
                {latest.status !== 'returned' && <button type="submit" disabled={act.busy || marks === ''} className="rounded-lg border border-line px-4 py-2.5 font-medium disabled:opacity-50">Save marks</button>}
                <div className="w-64"><Button type="button" loading={act.busy} disabled={marks === ''} onClick={() => save(true)}>{latest.status === 'returned' ? 'Update and return' : 'Save and return to student'}</Button></div>
              </div>
            </form>
          </div>
        )}
      </DataState>
    </Card>
  );
}

export default function AssignmentDetail() {
  const { id = '' } = useParams();
  const a = useFetch<AssignmentFull>(`/assignments/${id}`);
  const roster = useFetch<RosterRow[]>(`/assignments/${id}/roster`);
  const [picked, setPicked] = useState('');
  const act = useAction(); const [note, setNote] = useState('');
  const markedNotReturned = roster.data?.filter((r) => r.status === 'graded').length ?? 0;

  async function returnAll() {
    setNote('');
    let n = 0;
    if (await act.run(async () => { n = (await api<{ returned: number }>(`/assignments/${id}/return-graded`, { method: 'POST', body: {} })).returned; })) { setNote(`${n} piece${n === 1 ? '' : 's'} of marked work returned.`); roster.reload(); }
  }
  async function setStatus(status: string) { if (await act.run(() => api(`/assignments/${id}`, { method: 'PATCH', body: { status } }))) a.reload(); }

  return (
    <>
      <p className="mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/teacher/assignments">All assignments</Link></p>
      <DataState loading={a.loading} error={a.error}>
        {a.data && (
          <>
            <PageHeader title={a.data.title} intro={`${a.data.className} · ${a.data.subjectName} · due ${fmtDateTime(a.data.dueAt)} · ${a.data.maxMarks} marks`} />
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Badge tone={STATUS_BADGE[a.data.status][1]}>{STATUS_BADGE[a.data.status][0]}</Badge>
              <span className="text-sm text-muted">{a.data.allowResubmission ? 'Resubmission allowed' : 'Resubmission not allowed'}</span>
              {a.data.status === 'published' && <SmallButton onClick={() => setStatus('closed')} disabled={act.busy}>Close assignment</SmallButton>}
              {a.data.status === 'closed' && <SmallButton onClick={() => setStatus('published')} disabled={act.busy}>Reopen</SmallButton>}
              {a.data.status === 'draft' && <SmallButton onClick={() => setStatus('published')} disabled={act.busy}>Publish</SmallButton>}
            </div>
            {act.error && <div className="mb-4"><Alert tone="error">{act.error}</Alert></div>}
            {note && <div className="mb-4"><Alert tone="success">{note}</Alert></div>}
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Card title="Class list" action={markedNotReturned > 0 ? <SmallButton onClick={returnAll} disabled={act.busy}>Return {markedNotReturned} marked</SmallButton> : undefined}>
                <DataState loading={roster.loading} error={roster.error}>
                  {roster.data?.length ? (
                    <Table>
                      <thead><tr><Th>Student</Th><Th>Status</Th><Th>Marks</Th><Th /></tr></thead>
                      <tbody>{roster.data.map((r) => (
                        <tr key={r.studentId} className={picked === r.studentId ? 'bg-brand-50' : ''}>
                          <Td><div className="font-medium">{r.name}</div><div className="text-muted">{r.admissionNumber}</div></Td>
                          <Td><Badge tone={ROW_BADGE[r.status][1]}>{ROW_BADGE[r.status][0]}</Badge>{r.isLate && <> <Badge tone="bad">Late</Badge></>}{(r.attempt ?? 0) > 1 && <div className="text-muted">Attempt {r.attempt}</div>}</Td>
                          <Td>{r.marks ?? '-'}</Td>
                          <Td className="text-right">{r.submissionId && <SmallButton onClick={() => setPicked(r.studentId)}>{r.status === 'submitted' ? 'Mark' : 'View'}</SmallButton>}</Td>
                        </tr>))}</tbody>
                    </Table>
                  ) : <Empty>No students are in this class yet.</Empty>}
                </DataState>
              </Card>
              <div>{picked ? <Marking key={picked} assignment={a.data} studentId={picked} onSaved={roster.reload} /> : <Card><Empty>Choose a student to read their work and give marks.</Empty></Card>}</div>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
