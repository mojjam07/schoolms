import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { api, uploadFile } from '../../lib/api';
import { messageOf } from '../../lib/forms';
import type { FileInfo, NoteDetail, NoteSummary, TeacherAssignment } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

const MAX = 10 * 1024 * 1024;
const OK_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];
const STATUS = { draft: ['Draft', 'neutral'], published: ['Published', 'good'], archived: ['Archived', 'warn'] } as const;
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Editor({ noteId, assignments, onClose }: { noteId: string | null; assignments: TeacherAssignment[]; onClose: (changed: boolean) => void }) {
  const existing = useFetch<NoteDetail>(noteId ? `/lesson-notes/${noteId}` : null);
  const [pair, setPair] = useState(''); const [title, setTitle] = useState(''); const [topic, setTopic] = useState('');
  const [body, setBody] = useState(''); const [status, setStatus] = useState('draft'); const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState('');
  const save = useAction(); const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = existing.data; if (!n) return;
    setPair(`${n.classId}|${n.subjectId}`); setTitle(n.title); setTopic(n.topic ?? ''); setBody(n.body); setStatus(n.status); setFiles(n.files);
  }, [existing.data]);

  async function onPick(list: FileList | null) {
    const f = list?.[0]; if (!f) return;
    setUploadError('');
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!OK_EXT.includes(ext)) { setUploadError('This file type is not allowed. Use PDF, Word, PowerPoint, JPG or PNG.'); return; }
    if (f.size > MAX) { setUploadError('That file is larger than 10 MB. Please choose a smaller file.'); return; }
    setUploading(true);
    try { const up = await uploadFile(f); setFiles((x) => [...x, up]); } catch (e) { setUploadError(messageOf(e)); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [classId, subjectId] = pair.split('|');
    const payload = { classId, subjectId, title, topic, body, status, fileIds: files.map((f) => f.id) };
    if (await save.run(() => (noteId ? api(`/lesson-notes/${noteId}`, { method: 'PATCH', body: payload }) : api('/lesson-notes', { body: payload })))) onClose(true);
  }

  return (
    <Card title={noteId ? 'Edit lesson note' : 'New lesson note'}>
      <DataState loading={!!noteId && existing.loading} error={existing.error}>
        <form onSubmit={submit} className="grid gap-4 lg:max-w-3xl" noValidate>
          <Select label="Class and subject" value={pair} onChange={(e) => setPair(e.target.value)} error={save.fields.classId}>
            <option value="">Choose…</option>
            {assignments.map((a) => <option key={a.id} value={`${a.classId}|${a.subjectId}`}>{a.className} · {a.subjectName}</option>)}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" value={title} error={save.fields.title} onChange={(e) => setTitle(e.target.value)} />
            <Field label="Topic (optional)" value={topic} error={save.fields.topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <TextArea label="Note" rows={10} value={body} error={save.fields.body} onChange={(e) => setBody(e.target.value)} hint="Plain text. Attach files below for slides, handouts or images." />
          <div>
            <p className="mb-1.5 text-sm font-medium">Attachments</p>
            {files.length > 0 && (
              <ul className="mb-3 space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{f.name} <span className="text-muted">({size(f.sizeBytes)})</span></span>
                    <SmallButton type="button" tone="danger" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>Remove</SmallButton>
                  </li>
                ))}
              </ul>
            )}
            <input ref={input} type="file" aria-label="Add an attachment" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" disabled={uploading || files.length >= 10}
              onChange={(e) => onPick(e.target.files)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            <p className="mt-1.5 text-sm text-muted">PDF, Word, PowerPoint, JPG or PNG. Up to 10 MB each.{uploading && ' Uploading…'}</p>
            {uploadError && <div className="mt-2"><Alert tone="error">{uploadError}</Alert></div>}
          </div>
          <Select label="Visibility" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft (only you can see it)</option><option value="published">Published (students in the class can see it)</option><option value="archived">Archived (hidden from students)</option>
          </Select>
          {save.error && <Alert tone="error">{save.error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <div className="w-40"><Button type="submit" loading={save.busy} disabled={uploading || !pair}>Save note</Button></div>
            <button type="button" onClick={() => onClose(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button>
          </div>
        </form>
      </DataState>
    </Card>
  );
}

export default function Notes() {
  const assignments = useFetch<TeacherAssignment[]>('/teachers/me/assignments');
  const notes = useFetch<NoteSummary[]>('/lesson-notes');
  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined = list view, null = new note

  if (editing !== undefined) {
    return (
      <>
        <PageHeader title="Lesson notes" />
        <Editor noteId={editing} assignments={assignments.data ?? []} onClose={(changed) => { setEditing(undefined); if (changed) notes.reload(); }} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Lesson notes" intro="Write notes and attach handouts for the classes you teach. Students only see notes you publish." />
      <Card title="Your notes" action={<div className="w-36"><Button onClick={() => setEditing(null)} disabled={!assignments.data?.length}>New note</Button></div>}>
        <DataState loading={notes.loading} error={notes.error}>
          {notes.data?.length ? (
            <Table>
              <thead><tr><Th>Title</Th><Th>Class</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{notes.data.map((n) => (
                <tr key={n.id}>
                  <Td><div className="font-medium">{n.title}</div><div className="text-muted">{n.subjectName}{n.topic ? ` · ${n.topic}` : ''}{n.fileCount ? ` · ${n.fileCount} file${n.fileCount > 1 ? 's' : ''}` : ''}</div></Td>
                  <Td>{n.className}</Td>
                  <Td><Badge tone={STATUS[n.status][1]}>{STATUS[n.status][0]}</Badge></Td>
                  <Td className="text-right"><SmallButton onClick={() => setEditing(n.id)}>Edit</SmallButton></Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <Empty>{assignments.data?.length ? 'No lesson notes yet. Choose New note to write your first one.' : 'You need a class assignment from the administrator before you can post notes.'}</Empty>}
        </DataState>
      </Card>
    </>
  );
}
