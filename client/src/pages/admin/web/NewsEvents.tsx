import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, TextArea, Th } from '../../../components/ui';
import { AuthImage } from '../../../components/AuthImage';
import { api, uploadFile } from '../../../lib/api';
import { checkImage, fmtDateTime, fromLocalInput, toLocalInput } from '../../../lib/format';
import { messageOf } from '../../../lib/forms';
import { useAction, useFetch } from '../../../lib/useFetch';

interface Post { id: string; kind: 'news' | 'announcement'; title: string; slug: string; summary: string; body?: string; imageId: string | null; imageAlt: string; status: 'draft' | 'published'; pinned: boolean; expiresAt: string | null; publishedAt: string | null }
interface Ev { id: string; title: string; description: string; location: string; startsAt: string; endsAt: string | null; status: 'draft' | 'published' }

function PostEditor({ id, onClose }: { id: string | null; onClose: (changed: boolean) => void }) {
  const cur = useFetch<Post>(id ? `/admin/site/posts/${id}` : null);
  const [f, setF] = useState({ kind: 'news', title: '', summary: '', body: '', imageId: null as string | null, imageAlt: '', status: 'draft', pinned: false, expiresAt: '' });
  const [up, setUp] = useState(false); const [upErr, setUpErr] = useState(''); const save = useAction(); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const p = cur.data; if (p) setF({ kind: p.kind, title: p.title, summary: p.summary, body: p.body ?? '', imageId: p.imageId, imageAlt: p.imageAlt, status: p.status, pinned: p.pinned, expiresAt: toLocalInput(p.expiresAt) }); }, [cur.data]);
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  async function pick(list: FileList | null) {
    const file = list?.[0]; if (!file) return; const problem = checkImage(file); setUpErr(problem ?? ''); if (problem) return;
    setUp(true); try { set('imageId', (await uploadFile(file, 'public')).id); } catch (e) { setUpErr(messageOf(e)); } finally { setUp(false); if (input.current) input.current.value = ''; }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { kind: f.kind, title: f.title, summary: f.summary, body: f.body, imageId: f.imageId, imageAlt: f.imageAlt, status: f.status, pinned: f.pinned, expiresAt: fromLocalInput(f.expiresAt) };
    if (await save.run(() => (id ? api(`/admin/site/posts/${id}`, { method: 'PATCH', body }) : api('/admin/site/posts', { body })))) onClose(true);
  }
  return (
    <Card title={id ? 'Edit post' : 'New post'}>
      <DataState loading={!!id && cur.loading} error={cur.error}>
        <form onSubmit={submit} className="grid gap-4 lg:max-w-3xl" noValidate>
          <Select label="Type" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="news">News story (a page of its own)</option><option value="announcement">Announcement (a notice; students, parents and teachers are notified)</option></Select>
          <Field label="Title" value={f.title} error={save.fields.title} onChange={(e) => set('title', e.target.value)} />
          <Field label="Short summary" value={f.summary} error={save.fields.summary} hint="Shown in lists and on the home page." onChange={(e) => set('summary', e.target.value)} />
          <TextArea label="Full text" rows={9} value={f.body} error={save.fields.body} hint="Plain text. A blank line starts a new paragraph." onChange={(e) => set('body', e.target.value)} />
          <div>
            <p className="mb-1.5 text-sm font-medium">Picture (optional)</p>
            {f.imageId && <div className="mb-3 flex items-start gap-3"><AuthImage fileId={f.imageId} alt={f.imageAlt || 'Chosen picture'} className="h-24 w-36 rounded object-cover" /><SmallButton type="button" tone="danger" onClick={() => { set('imageId', null); }}>Remove picture</SmallButton></div>}
            <input ref={input} type="file" aria-label="Choose a picture" accept=".jpg,.jpeg,.png" disabled={up} onChange={(e) => pick(e.target.files)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            <p className="mt-1.5 text-sm text-muted">JPG or PNG, up to 10 MB.{up && ' Uploading…'}</p>{upErr && <div className="mt-2"><Alert tone="error">{upErr}</Alert></div>}
            {f.imageId && <div className="mt-3"><Field label="Describe the picture" value={f.imageAlt} error={save.fields.imageAlt} hint="For visitors who cannot see it, for example: Pupils running the 100 metres race." onChange={(e) => set('imageAlt', e.target.value)} /></div>}
          </div>
          {f.kind === 'announcement' && <div className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} />Pin to the top</label><Field label="Stop showing on (optional)" type="datetime-local" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} /></div>}
          <Select label="Visibility" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="draft">Draft (only administrators can see it)</option><option value="published">Published (visible on the website)</option></Select>
          {save.error && !Object.keys(save.fields).length && <Alert tone="error">{save.error}</Alert>}
          <div className="flex flex-wrap gap-3"><div className="w-40"><Button type="submit" loading={save.busy} disabled={up}>Save post</Button></div><button type="button" onClick={() => onClose(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button></div>
        </form>
      </DataState>
    </Card>
  );
}

function EventEditor({ ev, onClose }: { ev: Ev | null; onClose: (changed: boolean) => void }) {
  const [f, setF] = useState({ title: ev?.title ?? '', description: ev?.description ?? '', location: ev?.location ?? '', startsAt: toLocalInput(ev?.startsAt ?? null), endsAt: toLocalInput(ev?.endsAt ?? null), status: ev?.status ?? 'draft' });
  const save = useAction(); const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { title: f.title, description: f.description, location: f.location, startsAt: fromLocalInput(f.startsAt) ?? '', endsAt: fromLocalInput(f.endsAt), status: f.status };
    if (await save.run(() => (ev ? api(`/admin/site/events/${ev.id}`, { method: 'PATCH', body }) : api('/admin/site/events', { body })))) onClose(true);
  }
  return (
    <Card title={ev ? 'Edit event' : 'New event'}>
      <form onSubmit={submit} className="grid gap-4 lg:max-w-3xl" noValidate>
        <Field label="Title" value={f.title} error={save.fields.title} onChange={(e) => set('title', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts" type="datetime-local" value={f.startsAt} error={save.fields.startsAt} onChange={(e) => set('startsAt', e.target.value)} /><Field label="Ends (optional)" type="datetime-local" value={f.endsAt} error={save.fields.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></div>
        <Field label="Where" value={f.location} onChange={(e) => set('location', e.target.value)} />
        <TextArea label="Details" rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} />
        <Select label="Visibility" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="draft">Draft (hidden)</option><option value="published">Published (visible; students, parents and teachers are notified once)</option></Select>
        {save.error && !Object.keys(save.fields).length && <Alert tone="error">{save.error}</Alert>}
        <div className="flex flex-wrap gap-3"><div className="w-40"><Button type="submit" loading={save.busy}>Save event</Button></div><button type="button" onClick={() => onClose(false)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button></div>
      </form>
    </Card>
  );
}

export default function NewsEvents() {
  const [tab, setTab] = useState<'posts' | 'events'>('posts');
  const posts = useFetch<Post[]>('/admin/site/posts'); const events = useFetch<Ev[]>('/admin/site/events');
  const [editPost, setEditPost] = useState<string | null | undefined>(undefined); const [editEv, setEditEv] = useState<Ev | null | undefined>(undefined);
  const act = useAction();
  async function del(path: string, name: string, reload: () => void) { if (window.confirm(`Delete "${name}"? This cannot be undone.`) && (await act.run(() => api(path, { method: 'DELETE' })))) reload(); }
  async function toggle(path: string, status: string, reload: () => void) { if (await act.run(() => api(path, { method: 'PATCH', body: { status: status === 'published' ? 'draft' : 'published' } }))) reload(); }

  if (editPost !== undefined) return (<><PageHeader title="News and announcements" /><PostEditor id={editPost} onClose={(c) => { setEditPost(undefined); if (c) posts.reload(); }} /></>);
  if (editEv !== undefined) return (<><PageHeader title="Events" /><EventEditor ev={editEv} onClose={(c) => { setEditEv(undefined); if (c) events.reload(); }} /></>);
  return (
    <>
      <PageHeader title="News and events" intro="Stories, notices and events for the public website. Nothing appears until you publish it." />
      <div role="tablist" className="mb-4 flex gap-2">{(['posts', 'events'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${tab === t ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white'}`}>{t === 'posts' ? 'News and announcements' : 'Events'}</button>)}</div>
      {act.error && <div className="mb-4"><Alert tone="error">{act.error}</Alert></div>}
      {tab === 'posts' ? (
        <Card title="Posts" action={<div className="w-32"><Button onClick={() => setEditPost(null)}>New post</Button></div>}>
          <DataState loading={posts.loading && !posts.data} error={posts.error}>
            {posts.data?.length ? <Table><thead><tr><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th /></tr></thead><tbody>{posts.data.map((p) => (
              <tr key={p.id}><Td><div className="font-medium">{p.title}</div><div className="text-muted">{p.publishedAt ? `Published ${fmtDateTime(p.publishedAt)}` : 'Not published'}</div></Td><Td>{p.kind === 'news' ? 'News' : 'Announcement'}{p.pinned && <> <Badge tone="warn">Pinned</Badge></>}</Td>
                <Td><Badge tone={p.status === 'published' ? 'good' : 'neutral'}>{p.status === 'published' ? 'Published' : 'Draft'}</Badge></Td>
                <Td className="whitespace-nowrap text-right"><span className="inline-flex gap-2"><SmallButton onClick={() => setEditPost(p.id)}>Edit</SmallButton><SmallButton onClick={() => toggle(`/admin/site/posts/${p.id}`, p.status, posts.reload)} disabled={act.busy}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</SmallButton><SmallButton tone="danger" onClick={() => del(`/admin/site/posts/${p.id}`, p.title, posts.reload)} disabled={act.busy}>Delete</SmallButton></span></Td></tr>))}</tbody></Table> : <Empty>No posts yet.</Empty>}
          </DataState>
        </Card>
      ) : (
        <Card title="Events" action={<div className="w-32"><Button onClick={() => setEditEv(null)}>New event</Button></div>}>
          <DataState loading={events.loading && !events.data} error={events.error}>
            {events.data?.length ? <Table><thead><tr><Th>Event</Th><Th>Status</Th><Th /></tr></thead><tbody>{events.data.map((e) => (
              <tr key={e.id}><Td><div className="font-medium">{e.title}</div><div className="text-muted">{fmtDateTime(e.startsAt)}{e.location ? ` · ${e.location}` : ''}</div></Td><Td><Badge tone={e.status === 'published' ? 'good' : 'neutral'}>{e.status === 'published' ? 'Published' : 'Draft'}</Badge></Td>
                <Td className="whitespace-nowrap text-right"><span className="inline-flex gap-2"><SmallButton onClick={() => setEditEv(e)}>Edit</SmallButton><SmallButton onClick={() => toggle(`/admin/site/events/${e.id}`, e.status, events.reload)} disabled={act.busy}>{e.status === 'published' ? 'Unpublish' : 'Publish'}</SmallButton><SmallButton tone="danger" onClick={() => del(`/admin/site/events/${e.id}`, e.title, events.reload)} disabled={act.busy}>Delete</SmallButton></span></Td></tr>))}</tbody></Table> : <Empty>No events yet.</Empty>}
          </DataState>
        </Card>
      )}
    </>
  );
}
