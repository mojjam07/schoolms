import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { api, uploadFile } from '../../lib/api';
import { checkFile, fileSize, fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/format';
import { messageOf } from '../../lib/forms';
import type { AssignmentFull, FileInfo, TeacherAssignment, TeacherAssignmentRow } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export const STATUS_BADGE = { draft: ['Draft', 'neutral'], published: ['Published', 'good'], closed: ['Closed', 'warn'] } as const;

function Editor({ id, assignments, onClose }: { id: string | null; assignments: TeacherAssignment[]; onClose: (changed: boolean) => void }) {
  const existing = useFetch<AssignmentFull>(id ? `/assignments/${id}` : null);
  const [pair, setPair] = useState(''); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [instructions, setInstructions] = useState('');
  const [maxMarks, setMaxMarks] = useState('20'); const [publishAt, setPublishAt] = useState(''); const [dueAt, setDueAt] = useState('');
  const [resubmit, setResubmit] = useState(false); const [status, setStatus] = useState('draft'); const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState('');
  const save = useAction(); const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = existing.data; if (!a) return;
    setPair(`${a.classId}|${a.subjectId}`); setTitle(a.title); setDescription(a.description); setInstructions(a.instructions); setMaxMarks(String(a.maxMarks));
    setPublishAt(toLocalInput(a.publishAt)); setDueAt(toLocalInput(a.dueAt)); setResubmit(a.allowResubmission); setStatus(a.status); setFiles(a.files);
  }, [existing.data]);

  async function onPick(list: FileList | null) {
    const f = list?.[0]; if (!f) return;
    const problem = checkFile(f); setUploadError(problem ?? ''); if (problem) return;
    setUploading(true);
    try { const up = await uploadFile(f, 'assignment'); setFiles((x) => [...x, up]); } catch (e) { setUploadError(messageOf(e)); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [classId, subjectId] = pair.split('|');
    const payload = { classId, subjectId, title, description, instructions, maxMarks: Number(maxMarks), publishAt: fromLocalInput(publishAt), dueAt: fromLocalInput(dueAt) ?? '', allowResubmission: resubmit, status, fileIds: files.map((f) => f.id) };
    if (await save.run(() => (id ? api(`/assignments/${id}`, { method: 'PATCH', body: payload }) : api('/assignments', { body: payload })))) onClose(true);
  }

  return (
    <Card title={id ? 'Edit assignment' : 'New assignment'}>
      <DataState loading={!!id && existing.loading} error={existing.error}>
        <form onSubmit={submit} className="grid gap-4 lg:max-w-3xl" noValidate>
          <Select label="Class and subject" value={pair} onChange={(e) => setPair(e.target.value)}>
            <option value="">Choose…</option>{assignments.map((a) => <option key={a.id} value={`${a.classId}|${a.subjectId}`}>{a.className} · {a.subjectName}</option>)}
          </Select>
          <Field label="Title" value={title} error={save.fields.title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea label="Description" rows={4} value={description} error={save.fields.description} onChange={(e) => setDescription(e.target.value)} />
          <TextArea label="Instructions for students" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} hint="For example: how to lay out the answers, or what to attach." />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Maximum marks" type="number" min="1" step="0.5" value={maxMarks} error={save.fields.maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
            <Field label="Due date and time" type="datetime-local" value={dueAt} error={save.fields.dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <Field label="Show to students from (optional)" type="datetime-local" value={publishAt} error={save.fields.publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={resubmit} onChange={(e) => setResubmit(e.target.checked)} />
            <span><span className="font-medium">Allow resubmission.</span> <span className="text-muted">Students can replace their work until you start marking, and send a new attempt after you return it. Off by default.</span></span>
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium">Attachments</p>
            {files.length > 0 && (
              <ul className="mb-3 space-y-2">{files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{f.name} <span className="text-muted">({fileSize(f.sizeBytes)})</span></span>
                  <SmallButton type="button" tone="danger" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>Remove</SmallButton>
                </li>))}</ul>
            )}
            <input ref={input} type="file" aria-label="Add an attachment" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" disabled={uploading || files.length >= 10} onChange={(e) => onPick(e.target.files)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            <p className="mt-1.5 text-sm text-muted">PDF, Word, PowerPoint, JPG or PNG. Up to 10 MB each.{uploading && ' Uploading…'}</p>
            {uploadError && <div className="mt-2"><Alert tone="error">{uploadError}</Alert></div>}
          </div>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft (only you can see it)</option><option value="published">Published (students can see it and submit)</option>
            {id && <option value="closed">Closed (visible, but no new work accepted)</option>}
          </Select>
          {save.error && <Alert tone="error">{save.error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <div className="w-44"><Button type="submit" loading={save.busy} disabled={uploading || !pair}>Save assignment</Button></div>
            <button type="button" onClick={() => onClose(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button>
          </div>
        </form>
      </DataState>
    </Card>
  );
}

export default function Assignments() {
  const mine = useFetch<TeacherAssignment[]>('/teachers/me/assignments');
  const list = useFetch<TeacherAssignmentRow[]>('/assignments');
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  if (editing !== undefined) {
    return (<><PageHeader title="Assignments" /><Editor id={editing} assignments={mine.data ?? []} onClose={(c) => { setEditing(undefined); if (c) list.reload(); }} /></>);
  }
  return (
    <>
      <PageHeader title="Assignments" intro="Set work for your classes, then mark what students hand in. Students only see an assignment once it is published." />
      <Card title="Your assignments" action={<div className="w-40"><Button onClick={() => setEditing(null)} disabled={!mine.data?.length}>New assignment</Button></div>}>
        <DataState loading={list.loading} error={list.error}>
          {list.data?.length ? (
            <Table>
              <thead><tr><Th>Assignment</Th><Th>Due</Th><Th>Handed in</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{list.data.map((a) => (
                <tr key={a.id}>
                  <Td><Link className="font-medium text-brand-700 underline" to={`/teacher/assignments/${a.id}`}>{a.title}</Link><div className="text-muted">{a.className} · {a.subjectName}</div></Td>
                  <Td>{fmtDateTime(a.dueAt)}</Td>
                  <Td>{a.submittedCount} of {a.enrolledCount}{a.toMarkCount > 0 && <div><Badge tone="warn">{a.toMarkCount} to mark</Badge></div>}{a.lateCount > 0 && <div className="text-muted">{a.lateCount} late</div>}</Td>
                  <Td><Badge tone={STATUS_BADGE[a.status][1]}>{STATUS_BADGE[a.status][0]}</Badge></Td>
                  <Td className="text-right"><SmallButton onClick={() => setEditing(a.id)}>Edit</SmallButton></Td>
                </tr>))}</tbody>
            </Table>
          ) : <Empty>{mine.data?.length ? 'No assignments yet. Choose New assignment to set the first one.' : 'You need a class assignment from the administrator before you can set work.'}</Empty>}
        </DataState>
      </Card>
    </>
  );
}
