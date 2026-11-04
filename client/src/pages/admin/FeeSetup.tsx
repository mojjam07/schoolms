import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import { naira, nairaInput, toKobo } from '../../lib/format';
import type { FeeCategory, SchoolClass, Session, Term } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

function useTermOptions() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const terms = useFetch<Term[]>('/academic/terms');
  const label = (t: Term) => `${sessions.data?.find((s) => s.id === t.sessionId)?.name ?? ''} · ${t.name}`;
  const sorted = [...(terms.data ?? [])].sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
  return { terms: sorted, label, current: sorted.find((t) => t.isCurrent) ?? sorted[0], loading: sessions.loading || terms.loading, error: sessions.error || terms.error };
}

export default function FeeSetup() {
  const { terms, label, current, loading: tLoading, error: tError } = useTermOptions();
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const cats = useFetch<FeeCategory[]>('/fees/categories');

  const [termId, setTermId] = useState(''); const [classId, setClassId] = useState('');
  const tid = termId || current?.id || ''; const cid = classId || classes.data?.[0]?.id || '';
  const sched = useFetch<{ items: { categoryId: string; amountKobo: number }[]; totalKobo: number }>(tid && cid ? `/fees/schedule?termId=${tid}&classId=${cid}` : null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    sched.data?.items.forEach((i) => { m[i.categoryId] = nairaInput(i.amountKobo); });
    setAmounts(m);
  }, [sched.data]);

  const addCat = useAction(); const [cf, setCf] = useState({ name: '', description: '' });
  const saveSched = useAction(); const [saved, setSaved] = useState('');
  const gen = useAction(); const [genTerm, setGenTerm] = useState(''); const [genClass, setGenClass] = useState(''); const [due, setDue] = useState(''); const [genResult, setGenResult] = useState('');
  const catAct = useAction();

  const parsed = Object.entries(amounts).filter(([, v]) => v.trim() !== '').map(([categoryId, v]) => ({ categoryId, kobo: toKobo(v) }));
  const bad = parsed.some((p) => p.kobo === null || p.kobo <= 0);
  const total = parsed.reduce((s, p) => s + (p.kobo ?? 0), 0);

  async function addCategory(e: FormEvent) { e.preventDefault(); if (await addCat.run(() => api('/fees/categories', { body: cf }))) { setCf({ name: '', description: '' }); cats.reload(); } }
  async function toggle(c: FeeCategory) { if (await catAct.run(() => api(`/fees/categories/${c.id}`, { method: 'PATCH', body: { active: !c.active } }))) cats.reload(); }
  async function saveSchedule() {
    setSaved('');
    const items = parsed.map((p) => ({ categoryId: p.categoryId, amountKobo: p.kobo! }));
    if (await saveSched.run(() => api('/fees/schedule', { method: 'PUT', body: { termId: tid, classId: cid, items } }))) { setSaved('Fees saved for this class and term.'); sched.reload(); }
  }
  async function generate(e: FormEvent) {
    e.preventDefault(); setGenResult('');
    let r: { created: number; skippedExisting: number; classesWithoutFees: number } | undefined;
    if (await gen.run(async () => { r = await api('/fees/invoices/generate', { body: { termId: genTerm || tid, ...(genClass ? { classId: genClass } : {}), ...(due ? { dueDate: due } : {}) } }); })) {
      setGenResult(`${r!.created} invoice${r!.created === 1 ? '' : 's'} created. ${r!.skippedExisting} student${r!.skippedExisting === 1 ? '' : 's'} already had one.${r!.classesWithoutFees ? ' This class has no fees set for the term, so nothing was created.' : ''}`);
    }
  }

  return (
    <>
      <PageHeader title="Fee setup" intro="Set what each class pays each term, then create invoices for the students. The school's real amounts go in here; nothing is pre-filled." />
      {catAct.error && <div className="mb-4"><Alert tone="error">{catAct.error}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="1. Fee categories">
          <DataState loading={cats.loading} error={cats.error}>
            {cats.data?.length ? (
              <Table><thead><tr><Th>Category</Th><Th /></tr></thead>
                <tbody>{cats.data.map((c) => (
                  <tr key={c.id}><Td><div className="font-medium">{c.name} {!c.active && <Badge tone="neutral">Not in use</Badge>}</div>{c.description && <div className="text-muted">{c.description}</div>}</Td>
                    <Td className="text-right"><SmallButton onClick={() => toggle(c)} disabled={catAct.busy}>{c.active ? 'Stop using' : 'Use again'}</SmallButton></Td></tr>
                ))}</tbody></Table>
            ) : <Empty>No categories yet. For example: Tuition, Books, Uniform, Exam fee.</Empty>}
          </DataState>
          <form onSubmit={addCategory} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" noValidate>
            <Field label="Category name" value={cf.name} error={addCat.fields.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
            <Field label="Note (optional)" value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} />
            <div className="sm:col-span-2">{addCat.error && <div className="mb-3"><Alert tone="error">{addCat.error}</Alert></div>}<Button type="submit" loading={addCat.busy}>Add category</Button></div>
          </form>
        </Card>

        <Card title="2. Fees for a class and term">
          <DataState loading={tLoading} error={tError}>
            {!terms.length ? <Empty>Add a session and its terms first (Sessions and terms).</Empty> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Term" value={tid} onChange={(e) => { setTermId(e.target.value); setSaved(''); }}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select>
                  <Select label="Class" value={cid} onChange={(e) => { setClassId(e.target.value); setSaved(''); }}>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                </div>
                <div className="mt-4">
                  <DataState loading={sched.loading || cats.loading} error={sched.error}>
                    {cats.data?.some((c) => c.active) ? (
                      <div className="space-y-3">
                        {cats.data.filter((c) => c.active || amounts[c.id]).map((c) => (
                          <Field key={c.id} label={`${c.name} (₦)`} inputMode="decimal" placeholder="Leave empty if not charged" value={amounts[c.id] ?? ''}
                            error={amounts[c.id] && toKobo(amounts[c.id]) === null ? 'Enter an amount like 150000 or 150000.50' : undefined}
                            onChange={(e) => { setSaved(''); setAmounts({ ...amounts, [c.id]: e.target.value }); }} />
                        ))}
                        <p className="font-medium">Total per student: {naira(total)}</p>
                      </div>
                    ) : <Empty>Add a fee category first.</Empty>}
                  </DataState>
                </div>
                {saveSched.error && <div className="mt-4"><Alert tone="error">{saveSched.error}</Alert></div>}
                {saved && <div className="mt-4"><Alert tone="success">{saved}</Alert></div>}
                <div className="mt-4 max-w-xs"><Button onClick={saveSchedule} loading={saveSched.busy} disabled={bad || !cats.data?.length}>Save fees</Button></div>
                <p className="mt-3 text-sm text-muted">Changing fees later does not change invoices that have already been created.</p>
              </>
            )}
          </DataState>
        </Card>

        <div className="xl:col-span-2">
          <Card title="3. Create invoices">
            <form onSubmit={generate} className="grid gap-4 sm:grid-cols-4" noValidate>
              <Select label="Term" value={genTerm || tid} onChange={(e) => setGenTerm(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select>
              <Select label="Class" value={genClass} onChange={(e) => setGenClass(e.target.value)}>
                <option value="">All classes that have fees set</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Field label="Payment deadline (optional)" type="date" value={due} error={gen.fields.dueDate} onChange={(e) => setDue(e.target.value)} />
              <div className="flex items-end"><Button type="submit" loading={gen.busy} disabled={!terms.length}>Create invoices</Button></div>
            </form>
            <p className="mt-3 text-sm text-muted">Each student placed in the class for that session gets one invoice for the term. Students who already have one are skipped, so it is safe to run again after enrolling new students.</p>
            {gen.error && <div className="mt-4"><Alert tone="error">{gen.error}</Alert></div>}
            {genResult && <div className="mt-4"><Alert tone="success">{genResult}</Alert></div>}
          </Card>
        </div>
      </div>
    </>
  );
}
