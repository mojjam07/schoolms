import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Field, PageHeader, SmallButton, TextArea } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAction, useFetch } from '../../../lib/useFetch';

type F =
  | { key: string; label: string; kind: 'text' | 'email'; hint?: string }
  | { key: string; label: string; kind: 'textarea'; rows?: number; hint?: string }
  | { key: string; label: string; kind: 'titled' | 'lines' | 'leaders'; hint?: string };
const SECTIONS: { id: string; label: string; intro?: string; fields: F[] }[] = [
  { id: 'contact', label: 'Contact details', intro: 'Only details you enter here are shown to the public. Leave a box empty to hide it.', fields: [
    { key: 'phone', label: 'Phone number', kind: 'text' }, { key: 'whatsapp', label: 'WhatsApp number', kind: 'text' }, { key: 'email', label: 'School email address', kind: 'email' },
    { key: 'officeHours', label: 'Office hours', kind: 'text', hint: 'For example: Monday to Friday, 8am to 3pm' },
    { key: 'mapQuery', label: 'Map search text', kind: 'text', hint: 'The Contact page map searches for this text. After saving, open the Contact page and check the map shows the right place. If it does not, add more detail here (for example a nearby landmark).' }] },
  { id: 'home', label: 'Home page', fields: [{ key: 'heroTitle', label: 'Headline', kind: 'text' }, { key: 'heroSubtitle', label: 'Welcome line under the headline', kind: 'textarea', rows: 2 }, { key: 'intro', label: 'Introduction', kind: 'textarea', rows: 4 }, { key: 'highlights', label: 'Highlights (up to 6)', kind: 'titled' }] },
  { id: 'about', label: 'About us', fields: [{ key: 'overview', label: 'Overview and history', kind: 'textarea', rows: 6 }, { key: 'mission', label: 'Mission', kind: 'textarea', rows: 3 }, { key: 'vision', label: 'Vision', kind: 'textarea', rows: 3 }, { key: 'philosophy', label: 'Educational philosophy', kind: 'textarea', rows: 5 }, { key: 'values', label: 'Values (up to 10)', kind: 'titled' }, { key: 'leadership', label: 'Leadership (up to 12)', kind: 'leaders' }] },
  { id: 'academics', label: 'Academics', intro: 'The list of subjects for each class is taken automatically from Classes and subjects.', fields: [{ key: 'intro', label: 'Introduction', kind: 'textarea', rows: 3 }, { key: 'curriculum', label: 'Curriculum', kind: 'textarea', rows: 6 }, { key: 'programmes', label: 'Programmes and extra support', kind: 'textarea', rows: 6 }] },
  { id: 'admissions', label: 'Admissions', fields: [{ key: 'openNote', label: 'Admission status note', kind: 'textarea', rows: 2, hint: 'For example whether admissions for the next session are open.' }, { key: 'intro', label: 'How admission works', kind: 'textarea', rows: 5 }, { key: 'requirements', label: 'Requirements (one per line)', kind: 'lines' }, { key: 'process', label: 'What happens after applying', kind: 'textarea', rows: 5 }] },
];
const isPh = (v: unknown): boolean => (typeof v === 'string' ? v.includes('[Placeholder]') : Array.isArray(v) ? v.some(isPh) : v && typeof v === 'object' ? Object.values(v).some(isPh) : false);

export default function Content() {
  const data = useFetch<{ content: Record<string, any>; placeholders: { section: string; field: string }[] }>('/admin/site/content');
  const [tab, setTab] = useState('contact'); const [draft, setDraft] = useState<Record<string, any>>({});
  const save = useAction(); const [msg, setMsg] = useState('');
  useEffect(() => { if (data.data) setDraft(structuredClone(data.data.content)); }, [data.data]);
  const sec = SECTIONS.find((s) => s.id === tab)!; const v = draft[tab] ?? {};
  const set = (key: string, val: unknown) => { setMsg(''); setDraft({ ...draft, [tab]: { ...v, [key]: val } }); };
  const left = data.data?.placeholders ?? [];

  async function submit() { setMsg(''); if (await save.run(() => api(`/admin/site/content/${tab}`, { method: 'PUT', body: v }))) { setMsg('Saved. The public website now shows this.'); data.reload(); } }

  return (
    <>
      <PageHeader title="Website content" intro="Edit what visitors read on the public website. Text is shown exactly as typed; blank lines start a new paragraph." />
      <DataState loading={data.loading && !data.data} error={data.error}>
        <div className="mb-6"><Card title="Before you launch">
          {left.length ? <><p>{left.length} piece{left.length === 1 ? '' : 's'} of text still say <strong>[Placeholder]</strong>. Visitors will see these words until you replace them.</p>
            <p className="mt-2 text-sm text-muted">Still to fill in: {[...new Set(left.map((p) => SECTIONS.find((s) => s.id === p.section)?.label ?? p.section))].join(', ')}.</p></> : <p className="text-brand-700">Every page has real text. Well done.</p>}
          {!(draft.contact?.phone || draft.contact?.email) && <p className="mt-2 text-sm text-muted">No phone number or email is shown on the website yet. Add them under Contact details.</p>}
        </Card></div>
        <div role="tablist" aria-label="Website sections" className="mb-4 flex flex-wrap gap-2">
          {SECTIONS.map((s) => <button key={s.id} role="tab" aria-selected={tab === s.id} onClick={() => { setTab(s.id); setMsg(''); save.clear(); }} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${tab === s.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white hover:bg-brand-50'}`}>{s.label}{s.id !== 'contact' && left.some((p) => p.section === s.id) && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-gold-400" aria-label="has placeholders" />}</button>)}
        </div>
        <Card title={sec.label}>
          {sec.intro && <p className="mb-4 text-sm text-muted">{sec.intro}</p>}
          <div className="grid gap-5 lg:max-w-3xl">
            {sec.fields.map((f) => {
              const val = v[f.key]; const ph = isPh(val);
              const hint = (f as any).hint as string | undefined;
              const tag = ph ? <Badge tone="warn">Still a placeholder</Badge> : null;
              if (f.kind === 'text' || f.kind === 'email') return <div key={f.key}><Field label={f.label} type={f.kind === 'email' ? 'email' : 'text'} value={val ?? ''} hint={hint} onChange={(e) => set(f.key, e.target.value)} />{tag}</div>;
              if (f.kind === 'textarea') return <div key={f.key}><TextArea label={f.label} rows={f.rows ?? 4} value={val ?? ''} hint={hint} onChange={(e) => set(f.key, e.target.value)} />{tag}</div>;
              const list: any[] = val ?? [];
              const upd = (i: number, patch: object) => set(f.key, list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const del = (i: number) => set(f.key, list.filter((_, j) => j !== i));
              return (
                <fieldset key={f.key} className="space-y-3"><legend className="mb-1 font-medium">{f.label} {tag}</legend>
                  {f.kind === 'lines' && list.map((x, i) => <div key={i} className="flex gap-2"><div className="flex-1"><Field label={`Item ${i + 1}`} value={x} onChange={(e) => set(f.key, list.map((y, j) => (j === i ? e.target.value : y)))} /></div><div className="self-end pb-1"><SmallButton type="button" tone="danger" onClick={() => del(i)}>Remove</SmallButton></div></div>)}
                  {f.kind === 'titled' && list.map((x, i) => <div key={i} className="space-y-2 rounded-lg border border-line p-3"><Field label={`Title ${i + 1}`} value={x.title} onChange={(e) => upd(i, { title: e.target.value })} /><TextArea label="Text" rows={2} value={x.text} onChange={(e) => upd(i, { text: e.target.value })} /><SmallButton type="button" tone="danger" onClick={() => del(i)}>Remove</SmallButton></div>)}
                  {f.kind === 'leaders' && list.map((x, i) => <div key={i} className="space-y-2 rounded-lg border border-line p-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Name" value={x.name} onChange={(e) => upd(i, { name: e.target.value })} /><Field label="Role" value={x.role} onChange={(e) => upd(i, { role: e.target.value })} /></div><TextArea label="Short biography" rows={3} value={x.bio} onChange={(e) => upd(i, { bio: e.target.value })} /><SmallButton type="button" tone="danger" onClick={() => del(i)}>Remove</SmallButton></div>)}
                  <SmallButton type="button" onClick={() => set(f.key, [...list, f.kind === 'lines' ? '' : f.kind === 'titled' ? { title: '', text: '' } : { name: '', role: '', bio: '' }])}>Add another</SmallButton>
                </fieldset>
              );
            })}
          </div>
          {save.error && <div className="mt-5"><Alert tone="error">{save.error}{save.fields && Object.keys(save.fields).length > 0 && <ul className="mt-1 list-disc pl-5">{Object.entries(save.fields).map(([k, m]) => <li key={k}>{k}: {m}</li>)}</ul>}</Alert></div>}
          {msg && <div className="mt-5"><Alert tone="success">{msg}</Alert></div>}
          <div className="mt-5 max-w-xs"><Button onClick={submit} loading={save.busy}>Save {sec.label.toLowerCase()}</Button></div>
        </Card>
      </DataState>
    </>
  );
}
