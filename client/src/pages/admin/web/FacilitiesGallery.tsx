import { useRef, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, TextArea } from '../../../components/ui';
import { AuthImage } from '../../../components/AuthImage';
import { api, uploadFile } from '../../../lib/api';
import { checkImage } from '../../../lib/format';

import { useAction, useFetch } from '../../../lib/useFetch';

interface Fac { id: string; category: string; name: string; description: string; sortOrder: number; status: 'draft' | 'published' }
interface Img { id: string; facilityId: string | null; fileId: string; caption: string; altText: string; status: 'draft' | 'published'; sortOrder: number }

function GalleryCard({ g, facs, reload }: { g: Img; facs: Fac[]; reload: () => void }) {
  const [caption, setCaption] = useState(g.caption); const [alt, setAlt] = useState(g.altText); const [fac, setFac] = useState(g.facilityId ?? ''); const act = useAction();
  const patch = async (body: object) => { if (await act.run(() => api(`/admin/site/gallery/${g.id}`, { method: 'PATCH', body }))) reload(); };
  const dirty = caption !== g.caption || alt !== g.altText || fac !== (g.facilityId ?? '');
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-white">
      <AuthImage fileId={g.fileId} alt={g.altText} className="aspect-video w-full object-cover" />
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between"><Badge tone={g.status === 'published' ? 'good' : 'neutral'}>{g.status === 'published' ? 'Published' : 'Draft'}</Badge>
          <span className="flex gap-2"><SmallButton onClick={() => patch({ status: g.status === 'published' ? 'draft' : 'published' })} disabled={act.busy}>{g.status === 'published' ? 'Unpublish' : 'Publish'}</SmallButton>
            <SmallButton tone="danger" onClick={async () => { if (window.confirm('Delete this picture?') && (await act.run(() => api(`/admin/site/gallery/${g.id}`, { method: 'DELETE' })))) reload(); }} disabled={act.busy}>Delete</SmallButton></span></div>
        <Field label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <Field label="Description for screen readers" value={alt} onChange={(e) => setAlt(e.target.value)} />
        <Select label="Facility" value={fac} onChange={(e) => setFac(e.target.value)}><option value="">Not linked to a facility</option>{facs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        {act.error && <Alert tone="error">{act.error}</Alert>}
        {dirty && <SmallButton onClick={() => patch({ caption, altText: alt, facilityId: fac || null })} disabled={act.busy}>Save changes</SmallButton>}
      </div>
    </li>
  );
}

export default function FacilitiesGallery() {
  const facs = useFetch<Fac[]>('/admin/site/facilities'); const gal = useFetch<Img[]>('/admin/site/gallery');
  const [ff, setFf] = useState({ category: '', name: '', description: '' }); const addF = useAction(); const rowAct = useAction();
  const [gf, setGf] = useState({ facilityId: '', caption: '', altText: '', status: 'draft' }); const [file, setFile] = useState<File | null>(null); const [fileErr, setFileErr] = useState(''); const addG = useAction(); const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Fac | null>(null); const edit = useAction();

  async function addFacility(e: FormEvent) { e.preventDefault(); if (await addF.run(() => api('/admin/site/facilities', { body: ff }))) { setFf({ category: ff.category, name: '', description: '' }); facs.reload(); } }
  async function addPicture(e: FormEvent) {
    e.preventDefault(); if (!file) { setFileErr('Choose a picture first.'); return; }
    if (await addG.run(async () => { const up = await uploadFile(file, 'public'); await api('/admin/site/gallery', { body: { fileId: up.id, facilityId: gf.facilityId || null, caption: gf.caption, altText: gf.altText, status: gf.status } }); })) {
      setGf({ ...gf, caption: '', altText: '' }); setFile(null); if (input.current) input.current.value = ''; gal.reload();
    }
  }
  async function saveEdit() { if (editing && (await edit.run(() => api(`/admin/site/facilities/${editing.id}`, { method: 'PATCH', body: { category: editing.category, name: editing.name, description: editing.description, sortOrder: editing.sortOrder } })))) { setEditing(null); facs.reload(); } }
  const toggle = async (f: Fac) => { if (await rowAct.run(() => api(`/admin/site/facilities/${f.id}`, { method: 'PATCH', body: { status: f.status === 'published' ? 'draft' : 'published' } }))) facs.reload(); };
  const remove = async (f: Fac) => { if (window.confirm(`Delete "${f.name}"? Its pictures stay in the gallery.`) && (await rowAct.run(() => api(`/admin/site/facilities/${f.id}`, { method: 'DELETE' })))) { facs.reload(); gal.reload(); } };

  return (
    <>
      <PageHeader title="Facilities and gallery" intro="Add only what the school really has. Facilities and pictures are hidden from visitors until you publish them." />
      {rowAct.error && <div className="mb-4"><Alert tone="error">{rowAct.error}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Facilities">
          <DataState loading={facs.loading && !facs.data} error={facs.error}>
            {facs.data?.length ? <ul className="divide-y divide-line">{facs.data.map((f) => (
              <li key={f.id} className="py-3">{editing?.id === f.id ? (
                <div className="space-y-3"><Field label="Category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /><Field label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /><TextArea label="Description" rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  {edit.error && <Alert tone="error">{edit.error}</Alert>}<div className="flex gap-2"><SmallButton onClick={saveEdit} disabled={edit.busy}>Save</SmallButton><SmallButton onClick={() => setEditing(null)}>Cancel</SmallButton></div></div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium">{f.name} <Badge tone={f.status === 'published' ? 'good' : 'neutral'}>{f.status === 'published' ? 'Published' : 'Draft'}</Badge></p><p className="text-sm text-muted">{f.category}</p></div>
                  <span className="flex gap-2"><SmallButton onClick={() => setEditing(f)}>Edit</SmallButton><SmallButton onClick={() => toggle(f)} disabled={rowAct.busy}>{f.status === 'published' ? 'Unpublish' : 'Publish'}</SmallButton><SmallButton tone="danger" onClick={() => remove(f)} disabled={rowAct.busy}>Delete</SmallButton></span></div>)}
              </li>))}</ul> : <Empty>No facilities yet. Add the first one below.</Empty>}
          </DataState>
          <form onSubmit={addFacility} className="mt-5 grid gap-4 border-t border-line pt-5" noValidate>
            <p className="font-medium">Add a facility</p>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Category" placeholder="For example: Laboratories" value={ff.category} error={addF.fields.category} onChange={(e) => setFf({ ...ff, category: e.target.value })} /><Field label="Name" value={ff.name} error={addF.fields.name} onChange={(e) => setFf({ ...ff, name: e.target.value })} /></div>
            <TextArea label="Description" rows={3} value={ff.description} onChange={(e) => setFf({ ...ff, description: e.target.value })} />
            {addF.error && !Object.keys(addF.fields).length && <Alert tone="error">{addF.error}</Alert>}<div className="max-w-xs"><Button type="submit" loading={addF.busy}>Add facility</Button></div>
          </form>
        </Card>
        <Card title="Add a picture">
          <form onSubmit={addPicture} className="grid gap-4" noValidate>
            <div><p className="mb-1.5 text-sm font-medium">Picture</p><input ref={input} type="file" aria-label="Choose a picture" accept=".jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0] ?? null; const p = f ? checkImage(f) : null; setFileErr(p ?? ''); setFile(p ? null : f); }} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" /><p className="mt-1.5 text-sm text-muted">JPG or PNG, up to 10 MB.</p>{fileErr && <div className="mt-2"><Alert tone="error">{fileErr}</Alert></div>}</div>
            <Field label="Description for visitors who cannot see it" value={gf.altText} error={addG.fields.altText} hint="For example: Pupils working at benches in the science laboratory." onChange={(e) => setGf({ ...gf, altText: e.target.value })} />
            <Field label="Caption (optional)" value={gf.caption} onChange={(e) => setGf({ ...gf, caption: e.target.value })} />
            <Select label="Facility" value={gf.facilityId} onChange={(e) => setGf({ ...gf, facilityId: e.target.value })}><option value="">Not linked to a facility</option>{facs.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            <Select label="Visibility" value={gf.status} onChange={(e) => setGf({ ...gf, status: e.target.value })}><option value="draft">Draft (hidden)</option><option value="published">Published</option></Select>
            {addG.error && !Object.keys(addG.fields).length && <Alert tone="error">{addG.error}</Alert>}<div className="max-w-xs"><Button type="submit" loading={addG.busy}>Upload picture</Button></div>
          </form>
        </Card>
        <div className="xl:col-span-2"><Card title="Gallery">
          <DataState loading={gal.loading && !gal.data} error={gal.error}>
            {gal.data?.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{gal.data.map((g) => <GalleryCard key={g.id} g={g} facs={facs.data ?? []} reload={gal.reload} />)}</ul> : <Empty>No pictures yet.</Empty>}
          </DataState>
        </Card></div>
      </div>
    </>
  );
}
