import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { AssessmentColumn, Band, Session } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

type Row = { minPercent: string; grade: string; remark: string };

function Scale() {
  const data = useFetch<{ bands: Band[] }>('/results/grading');
  const [rows, setRows] = useState<Row[]>([]); const save = useAction(); const tpl = useAction(); const [msg, setMsg] = useState('');
  useEffect(() => { if (data.data) setRows(data.data.bands.map((b) => ({ minPercent: String(b.minPercent), grade: b.grade, remark: b.remark }))); }, [data.data]);
  const upd = (i: number, k: keyof Row, v: string) => { setMsg(''); setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); };
  const bad = rows.some((r) => r.minPercent.trim() === '' || isNaN(Number(r.minPercent)) || Number(r.minPercent) < 0 || Number(r.minPercent) > 100 || !r.grade.trim());
  async function submit() {
    setMsg('');
    if (await save.run(() => api('/results/grading', { method: 'PUT', body: { bands: rows.map((r) => ({ minPercent: Number(r.minPercent), grade: r.grade.trim(), remark: r.remark.trim() })) } }))) { setMsg('Grading scale saved.'); data.reload(); }
  }
  async function template() {
    if (data.data?.bands.length && !window.confirm('Replace the current grading scale with the WAEC-style template (A1 to F9)? Report cards that are already published keep the scale they were published with.')) return;
    setMsg('');
    if (await tpl.run(() => api('/results/grading/template', { method: 'POST', body: {} }))) { setMsg('The WAEC-style template is now in place. Edit any band and save to change it.'); data.reload(); }
  }
  return (
    <Card title="Grading scale" action={<SmallButton onClick={template} disabled={tpl.busy}>Use WAEC-style template (A1 to F9)</SmallButton>}>
      <DataState loading={data.loading && !data.data} error={data.error}>
        {!rows.length && <Empty>No grading scale yet. Use the template, or add your own bands below.</Empty>}
        {rows.length > 0 && (
          <Table><thead><tr><Th>From (%)</Th><Th>Grade</Th><Th>Remark</Th><Th /></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}><Td><div className="w-24"><Field label="From %" inputMode="decimal" value={r.minPercent} onChange={(e) => upd(i, 'minPercent', e.target.value)} /></div></Td>
                <Td><div className="w-24"><Field label="Grade" value={r.grade} onChange={(e) => upd(i, 'grade', e.target.value)} /></div></Td>
                <Td><div className="min-w-[8rem]"><Field label="Remark" value={r.remark} onChange={(e) => upd(i, 'remark', e.target.value)} /></div></Td>
                <Td className="text-right"><SmallButton tone="danger" onClick={() => { setMsg(''); setRows(rows.filter((_, j) => j !== i)); }}>Remove</SmallButton></Td></tr>))}</tbody></Table>
        )}
        <p className="mt-3 text-sm text-muted">Each band runs from its "From" percentage up to the next band's. One band must start at 0 so every score gets a grade. Percentages are worked out from the total of all assessment columns.</p>
        <div className="mt-4 flex flex-wrap gap-3"><SmallButton onClick={() => { setMsg(''); setRows([...rows, { minPercent: '', grade: '', remark: '' }]); }}>Add a band</SmallButton></div>
        {(save.error || tpl.error) && <div className="mt-4"><Alert tone="error">{save.error || tpl.error}</Alert></div>}
        {msg && <div className="mt-4"><Alert tone="success">{msg}</Alert></div>}
        <div className="mt-4 max-w-xs"><Button onClick={submit} loading={save.busy} disabled={bad || !rows.length}>Save grading scale</Button></div>
      </DataState>
    </Card>
  );
}

function ColumnRow({ c, reload }: { c: AssessmentColumn; reload: () => void }) {
  const [name, setName] = useState(c.name); const [max, setMax] = useState(String(c.maxScore)); const act = useAction();
  const dirty = name !== c.name || Number(max) !== c.maxScore;
  return (
    <tr><Td><div className="min-w-[8rem]"><Field label="Name" value={name} onChange={(e) => setName(e.target.value)} /></div></Td>
      <Td>{c.kind === 'exam' ? <Badge tone="warn">Exam</Badge> : <Badge tone="neutral">Test / CA</Badge>}</Td>
      <Td><div className="w-24"><Field label="Out of" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} error={act.error || undefined} /></div></Td>
      <Td className="whitespace-nowrap text-right"><span className="inline-flex gap-2">
        {dirty && <SmallButton onClick={async () => { if (await act.run(() => api(`/results/components/${c.id}`, { method: 'PATCH', body: { name, maxScore: Number(max) } }))) reload(); }} disabled={act.busy}>Save</SmallButton>}
        <SmallButton tone="danger" disabled={act.busy || c.hasScores} title={c.hasScores ? 'Scores have been entered in this column' : undefined} onClick={async () => { if (window.confirm(`Delete the "${c.name}" column?`) && (await act.run(() => api(`/results/components/${c.id}`, { method: 'DELETE' })))) reload(); }}>Delete</SmallButton></span></Td></tr>
  );
}

function Columns() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const [picked, setPicked] = useState('');
  const sid = picked || sessions.data?.find((s) => s.isCurrent)?.id || sessions.data?.[0]?.id || '';
  const cols = useFetch<AssessmentColumn[]>(sid ? `/results/components?sessionId=${sid}` : null);
  const [f, setF] = useState({ name: '', kind: 'ca', maxScore: '' }); const add = useAction(); const tpl = useAction();
  const total = cols.data?.reduce((s, c) => s + c.maxScore, 0) ?? 0;
  async function create() { if (await add.run(() => api('/results/components', { body: { sessionId: sid, name: f.name, kind: f.kind, maxScore: Number(f.maxScore) } }))) { setF({ name: '', kind: 'ca', maxScore: '' }); cols.reload(); } }
  return (
    <Card title="Assessment columns">
      <p className="mb-4 text-sm text-muted">These are the columns teachers fill in for every subject, for example two tests and an exam. Every term in a session uses the same columns.</p>
      <div className="max-w-xs"><Select label="Session" value={sid} onChange={(e) => setPicked(e.target.value)}>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
      <div className="mt-4">
        <DataState loading={cols.loading && !cols.data} error={cols.error}>
          {cols.data?.length ? (
            <><Table><thead><tr><Th>Name</Th><Th>Type</Th><Th>Out of</Th><Th /></tr></thead><tbody>{cols.data.map((c) => <ColumnRow key={`${c.id}-${c.name}-${c.maxScore}`} c={c} reload={cols.reload} />)}</tbody></Table>
              <p className="mt-2 font-medium">Total per subject: {total} marks</p></>
          ) : (
            <div className="space-y-3"><Empty>No assessment columns for this session yet.</Empty>
              <SmallButton onClick={async () => { if (await tpl.run(() => api('/results/components/template', { body: { sessionId: sid } }))) cols.reload(); }} disabled={tpl.busy || !sid}>Use a common layout: CA 1 (20), CA 2 (20), Exam (60)</SmallButton>
              {tpl.error && <Alert tone="error">{tpl.error}</Alert>}</div>
          )}
        </DataState>
      </div>
      {!!cols.data?.length && (
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <Field label="New column" placeholder="For example: Project" value={f.name} error={add.fields.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="ca">Test / continuous assessment</option><option value="exam">Exam</option></Select>
          <Field label="Out of" inputMode="decimal" value={f.maxScore} error={add.fields.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} />
          <div className="flex items-end"><Button onClick={create} loading={add.busy} disabled={!f.name.trim() || !(Number(f.maxScore) > 0)}>Add column</Button></div>
          {add.error && !Object.keys(add.fields).length && <div className="sm:col-span-4"><Alert tone="error">{add.error}</Alert></div>}
        </div>
      )}
    </Card>
  );
}

export default function Grading() {
  return (
    <>
      <PageHeader title="Grading and assessment" intro="Set up how scores are recorded and graded. Teachers cannot enter scores until the columns exist." />
      <div className="space-y-6"><Columns /><Scale /></div>
    </>
  );
}
