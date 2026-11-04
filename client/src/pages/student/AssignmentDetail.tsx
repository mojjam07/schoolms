import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, PageHeader, SmallButton, TextArea } from '../../components/ui';
import { FileList } from '../../components/FileList';
import { api, uploadFile } from '../../lib/api';
import { checkFile, dueText, fileSize, fmtDateTime } from '../../lib/format';
import { messageOf } from '../../lib/forms';
import type { AssignmentFull, Attempt, FileInfo } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

function AttemptView({ a, max, label }: { a: Attempt; max: number; label: string }) {
  return (
    <div className="space-y-3">
      <p className="font-medium">{label} <span className="font-normal text-muted">· handed in {fmtDateTime(a.submittedAt)}</span> {a.isLate && <Badge tone="bad">Late</Badge>}</p>
      {a.textResponse && <p className="whitespace-pre-wrap break-words rounded-lg bg-brand-50 p-3">{a.textResponse}</p>}
      <FileList files={a.files} />
      {a.status === 'returned' ? (
        <div className="rounded-lg border border-brand-200 bg-white p-4">
          <p className="text-lg font-semibold">Marks: {a.marks} / {max}</p>
          {a.feedback ? <p className="mt-2 whitespace-pre-wrap break-words"><span className="font-medium">Teacher's feedback: </span>{a.feedback}</p> : <p className="mt-2 text-muted">Your teacher did not leave written feedback.</p>}
        </div>
      ) : <p className="text-sm text-muted">Your teacher has not returned this work yet.</p>}
    </div>
  );
}

export default function AssignmentDetail() {
  const { id = '' } = useParams();
  const asg = useFetch<AssignmentFull>(`/assignments/${id}`);
  const mine = useFetch<{ attempts: Attempt[] }>(`/assignments/${id}/my-submission`);
  const attempts = mine.data?.attempts ?? []; const latest = attempts[attempts.length - 1];

  const [text, setText] = useState(''); const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState('');
  const [editing, setEditing] = useState(false); const [confirmation, setConfirmation] = useState('');
  const act = useAction(); const input = useRef<HTMLInputElement>(null);

  const a = asg.data;
  const closed = a?.status === 'closed';
  const canResubmit = !!a?.allowResubmission && !closed && !!latest && latest.status !== 'graded';
  const showForm = !!a && !closed && (!latest || (canResubmit && editing));
  useEffect(() => { if (editing && latest) { setText(latest.status === 'submitted' ? latest.textResponse : ''); setFiles(latest.status === 'submitted' ? latest.files : []); } }, [editing, latest?.id]);
  const pastDue = !!a && new Date(a.dueAt) < new Date();

  async function onPick(list: FileList | null) {
    const f = list?.[0]; if (!f) return;
    const problem = checkFile(f); setUploadError(problem ?? ''); if (problem) return;
    setUploading(true);
    try { const up = await uploadFile(f, 'submission'); setFiles((x) => [...x, up]); } catch (e) { setUploadError(messageOf(e)); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setConfirmation('');
    let res: { confirmation: { submittedAt: string; isLate: boolean; attempt: number } } | undefined;
    if (await act.run(async () => { res = await api(`/assignments/${id}/submissions`, { body: { textResponse: text, fileIds: files.map((f) => f.id) } }); })) {
      setConfirmation(`Submitted on ${fmtDateTime(res!.confirmation.submittedAt)}${res!.confirmation.isLate ? ', after the deadline, so it is marked as late' : ', on time'}.`);
      setEditing(false); setText(''); setFiles([]); mine.reload();
    }
  }

  return (
    <>
      <p className="mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/student/assignments">All assignments</Link></p>
      <DataState loading={asg.loading} error={asg.error}>
        {a && (
          <>
            <PageHeader title={a.title} intro={`${a.subjectName} · ${a.teacherName} · ${a.maxMarks} marks`} />
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="The task">
                <p className="mb-3 text-sm"><span className="font-medium">Due:</span> {fmtDateTime(a.dueAt)} {!latest && !closed && <span className={pastDue ? 'font-medium text-red-700' : 'text-muted'}>({dueText(a.dueAt)})</span>}</p>
                {a.description && <p className="whitespace-pre-wrap break-words">{a.description}</p>}
                {a.instructions && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gold-100 px-3 py-2 text-sm"><span className="font-medium">Instructions: </span>{a.instructions}</p>}
                {a.files.length > 0 && <div className="mt-4"><p className="mb-2 text-sm font-medium">Files from your teacher</p><FileList files={a.files} /></div>}
                <p className="mt-4 text-sm text-muted">{a.allowResubmission ? 'You may resubmit this assignment after your teacher returns it.' : 'You can hand this in once. Check your work before you submit.'}</p>
              </Card>

              <Card title="Your work">
                <DataState loading={mine.loading} error={mine.error}>
                  {confirmation && <div className="mb-4"><Alert tone="success">{confirmation}</Alert></div>}
                  {closed && !latest && <Alert tone="error">This assignment is closed, so it can no longer be handed in.</Alert>}
                  {attempts.length > 1 && (
                    <div className="mb-5 space-y-4">{attempts.slice(0, -1).map((x) => <div key={x.id} className="border-b border-line pb-4"><AttemptView a={x} max={a.maxMarks} label={`Attempt ${x.attempt}`} /></div>)}</div>
                  )}
                  {latest && !showForm && <AttemptView a={latest} max={a.maxMarks} label={attempts.length > 1 ? `Attempt ${latest.attempt} (latest)` : 'What you handed in'} />}
                  {latest?.status === 'graded' && a.allowResubmission && <p className="mt-3 text-sm text-muted">Your teacher is marking this work. You can send a new attempt once it has been returned.</p>}
                  {latest && canResubmit && !editing && (
                    <div className="mt-4"><SmallButton onClick={() => setEditing(true)}>{latest.status === 'submitted' ? 'Change my answer' : 'Send a new attempt'}</SmallButton></div>
                  )}
                  {showForm && (
                    <form onSubmit={submit} className="grid gap-4" noValidate>
                      {pastDue && <Alert tone="error">The deadline has passed. You can still hand this in, but it will be marked as late.</Alert>}
                      <TextArea label="Your answer" rows={7} value={text} onChange={(e) => setText(e.target.value)} hint="Type your answer, attach a file, or both." />
                      <div>
                        <p className="mb-1.5 text-sm font-medium">Files</p>
                        {files.length > 0 && <ul className="mb-3 space-y-2">{files.map((f) => (
                          <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                            <span className="min-w-0 truncate">{f.name} <span className="text-muted">({fileSize(f.sizeBytes)})</span></span>
                            <SmallButton type="button" tone="danger" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>Remove</SmallButton>
                          </li>))}</ul>}
                        <input ref={input} type="file" aria-label="Attach a file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" disabled={uploading || files.length >= 5} onChange={(e) => onPick(e.target.files)}
                          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" />
                        <p className="mt-1.5 text-sm text-muted">PDF, Word, PowerPoint, JPG or PNG. Up to 10 MB each, 5 files at most.{uploading && ' Uploading…'}</p>
                        {uploadError && <div className="mt-2"><Alert tone="error">{uploadError}</Alert></div>}
                      </div>
                      {act.error && <Alert tone="error">{act.error}</Alert>}
                      <div className="flex flex-wrap gap-3">
                        <div className="w-44"><Button type="submit" loading={act.busy} disabled={uploading}>{latest ? 'Resubmit' : 'Hand in'}</Button></div>
                        {editing && <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button>}
                      </div>
                    </form>
                  )}
                </DataState>
              </Card>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
