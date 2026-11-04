import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { TeacherAssignment, VideoLesson } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';
import { youtubeId } from '../../lib/youtube';

function Editor({ video, assignments, onClose }: { video: VideoLesson | null; assignments: TeacherAssignment[]; onClose: (changed: boolean) => void }) {
  const [pair, setPair] = useState(''); const [title, setTitle] = useState(''); const [topic, setTopic] = useState('');
  const [url, setUrl] = useState(''); const [description, setDescription] = useState(''); const [instructions, setInstructions] = useState(''); const [status, setStatus] = useState('draft');
  const save = useAction();
  useEffect(() => {
    if (!video) return;
    setPair(`${video.classId}|${video.subjectId}`); setTitle(video.title); setTopic(video.topic ?? ''); setUrl(`https://youtu.be/${video.youtubeId}`);
    setDescription(video.description); setInstructions(video.instructions); setStatus(video.status);
  }, [video]);
  const id = youtubeId(url);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [classId, subjectId] = pair.split('|');
    const payload = { classId, subjectId, title, topic, url, description, instructions, status };
    if (await save.run(() => (video ? api(`/video-lessons/${video.id}`, { method: 'PATCH', body: payload }) : api('/video-lessons', { body: payload })))) onClose(true);
  }

  return (
    <Card title={video ? 'Edit video lesson' : 'New video lesson'}>
      <form onSubmit={submit} className="grid gap-4 lg:max-w-3xl" noValidate>
        <Select label="Class and subject" value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="">Choose…</option>{assignments.map((a) => <option key={a.id} value={`${a.classId}|${a.subjectId}`}>{a.className} · {a.subjectName}</option>)}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" value={title} error={save.fields.title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <Field label="YouTube link" placeholder="https://www.youtube.com/watch?v=..." value={url} error={save.fields.url} onChange={(e) => setUrl(e.target.value)}
          hint="The video stays on YouTube. Students watch it here through YouTube's own player, and some videos may refuse to be embedded." />
        {id && (
          <div className="aspect-video w-full max-w-xl overflow-hidden rounded-lg border border-line bg-black">
            <iframe title="Video preview" src={`https://www.youtube-nocookie.com/embed/${id}`} className="h-full w-full" loading="lazy" allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" />
          </div>
        )}
        <TextArea label="Description (optional)" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextArea label="Instructions for students (optional)" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} hint="For example: watch to the end, then answer questions 1 to 5." />
        <Select label="Visibility" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">Draft (only you can see it)</option><option value="published">Published (students in the class can watch it)</option>
        </Select>
        {save.error && <Alert tone="error">{save.error}</Alert>}
        <div className="flex flex-wrap gap-3">
          <div className="w-40"><Button type="submit" loading={save.busy} disabled={!pair}>Save video</Button></div>
          <button type="button" onClick={() => onClose(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button>
        </div>
      </form>
    </Card>
  );
}

export default function Videos() {
  const assignments = useFetch<TeacherAssignment[]>('/teachers/me/assignments');
  const videos = useFetch<VideoLesson[]>('/video-lessons');
  const [editing, setEditing] = useState<VideoLesson | null | undefined>(undefined);
  const row = useAction();

  async function toggle(v: VideoLesson) {
    if (await row.run(() => api(`/video-lessons/${v.id}`, { method: 'PATCH', body: { status: v.status === 'published' ? 'draft' : 'published' } }))) videos.reload();
  }
  async function remove(v: VideoLesson) {
    if (!window.confirm(`Delete "${v.title}"? Students will no longer see it.`)) return;
    if (await row.run(() => api(`/video-lessons/${v.id}`, { method: 'DELETE' }))) videos.reload();
  }

  if (editing !== undefined) {
    return (<><PageHeader title="Video lessons" /><Editor video={editing} assignments={assignments.data ?? []} onClose={(c) => { setEditing(undefined); if (c) videos.reload(); }} /></>);
  }
  return (
    <>
      <PageHeader title="Video lessons" intro="Share YouTube videos with the classes you teach. The video is not copied or re-hosted, and students only see it once you publish it." />
      {row.error && <div className="mb-4"><Alert tone="error">{row.error}</Alert></div>}
      <Card title="Your videos" action={<div className="w-36"><Button onClick={() => setEditing(null)} disabled={!assignments.data?.length}>New video</Button></div>}>
        <DataState loading={videos.loading} error={videos.error}>
          {videos.data?.length ? (
            <Table>
              <thead><tr><Th>Video</Th><Th>Class</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>{videos.data.map((v) => (
                <tr key={v.id}>
                  <Td><div className="font-medium">{v.title}</div><div className="text-muted">{v.subjectName}{v.topic ? ` · ${v.topic}` : ''}</div></Td>
                  <Td>{v.className}</Td>
                  <Td><Badge tone={v.status === 'published' ? 'good' : 'neutral'}>{v.status === 'published' ? 'Published' : 'Draft'}</Badge></Td>
                  <Td className="whitespace-nowrap text-right">
                    <span className="inline-flex gap-2">
                      <SmallButton onClick={() => setEditing(v)}>Edit</SmallButton>
                      <SmallButton onClick={() => toggle(v)} disabled={row.busy}>{v.status === 'published' ? 'Unpublish' : 'Publish'}</SmallButton>
                      <SmallButton tone="danger" onClick={() => remove(v)} disabled={row.busy}>Delete</SmallButton>
                    </span>
                  </Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <Empty>No video lessons yet. Choose New video and paste a YouTube link.</Empty>}
        </DataState>
      </Card>
    </>
  );
}
