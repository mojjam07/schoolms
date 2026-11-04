import { useEffect, useState } from 'react';
import { Alert, Card, DataState, Empty, Field, PageHeader, Select, SmallButton } from '../../components/ui';
import { downloadFile } from '../../lib/api';
import { messageOf } from '../../lib/forms';
import type { MyClass, NoteDetail, NoteSummary, VideoLesson } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

const EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/';
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function NoteCard({ n }: { n: NoteSummary }) {
  const [open, setOpen] = useState(false);
  const detail = useFetch<NoteDetail>(open ? `/lesson-notes/${n.id}` : null);
  const [dlError, setDlError] = useState('');
  async function dl(id: string, name: string) { setDlError(''); try { await downloadFile(id, name); } catch (e) { setDlError(messageOf(e)); } }
  return (
    <li className="rounded-xl border border-line bg-white">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className="block font-medium">{n.title}</span>
          <span className="block text-sm text-muted">{n.subjectName}{n.topic ? ` · ${n.topic}` : ''} · {n.teacherName} · {when(n.publishedAt)}</span>
        </span>
        <span className="shrink-0 text-sm font-medium text-brand-700">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && (
        <div className="border-t border-line p-4">
          <DataState loading={detail.loading} error={detail.error}>
            {detail.data && (
              <>
                {detail.data.body ? <p className="whitespace-pre-wrap break-words">{detail.data.body}</p> : <p className="text-muted">This note has no text. See the attachments.</p>}
                {detail.data.files.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {detail.data.files.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{f.name} <span className="text-muted">({size(f.sizeBytes)})</span></span>
                        <SmallButton onClick={() => dl(f.id, f.name)}>Download</SmallButton>
                      </li>
                    ))}
                  </ul>
                )}
                {dlError && <div className="mt-3"><Alert tone="error">{dlError}</Alert></div>}
              </>
            )}
          </DataState>
        </div>
      )}
    </li>
  );
}

function VideoCard({ v }: { v: VideoLesson }) {
  const safe = v.embedUrl.startsWith(EMBED_PREFIX);
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="aspect-video w-full bg-black">
        {safe && <iframe title={v.title} src={v.embedUrl} className="h-full w-full" loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" />}
      </div>
      <div className="p-4">
        <h3 className="font-medium">{v.title}</h3>
        <p className="text-sm text-muted">{v.subjectName}{v.topic ? ` · ${v.topic}` : ''} · {v.teacherName}</p>
        {v.instructions && <p className="mt-3 rounded-lg bg-gold-100 px-3 py-2 text-sm"><span className="font-medium">Your task: </span>{v.instructions}</p>}
        {v.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{v.description}</p>}
        <p className="mt-3 text-sm"><a className="font-medium text-brand-700 underline" href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noreferrer">Open on YouTube</a> <span className="text-muted">if the video does not play here.</span></p>
      </div>
    </li>
  );
}

export default function Learning() {
  const me = useFetch<MyClass>('/students/me/class');
  const [subjectId, setSubjectId] = useState(''); const [q, setQ] = useState(''); const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams({ ...(subjectId && { subjectId }), ...(debounced && { q: debounced }) });
  const feed = useFetch<{ notes: NoteSummary[]; videos: VideoLesson[] }>(`/students/me/learning?${qs}`);
  const filtered = !!subjectId || !!debounced;

  return (
    <>
      <PageHeader title="My lessons" intro="Video lessons and notes your teachers have shared with your class." />
      <div className="mb-6 grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <Field label="Search" placeholder="Title or topic" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">All subjects</option>{me.data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <DataState loading={feed.loading && !feed.data} error={feed.error}>
        <div className="space-y-8">
          <section aria-labelledby="videos-h">
            <h2 id="videos-h" className="mb-3 font-display text-2xl font-bold">Video lessons</h2>
            {feed.data?.videos.length ? <ul className="grid gap-5 lg:grid-cols-2">{feed.data.videos.map((v) => <VideoCard key={v.id} v={v} />)}</ul>
              : <Empty>{filtered ? 'No video lessons match your search.' : 'No video lessons have been shared with your class yet. When a teacher adds one, it will appear here.'}</Empty>}
          </section>
          <section aria-labelledby="notes-h">
            <h2 id="notes-h" className="mb-3 font-display text-2xl font-bold">Lesson notes</h2>
            {feed.data?.notes.length ? <ul className="space-y-3">{feed.data.notes.map((n) => <NoteCard key={n.id} n={n} />)}</ul>
              : <Empty>{filtered ? 'No lesson notes match your search.' : 'No lesson notes have been shared with your class yet.'}</Empty>}
          </section>
        </div>
      </DataState>
    </>
  );
}
