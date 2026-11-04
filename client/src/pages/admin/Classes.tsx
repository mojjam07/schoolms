import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, DataState, Empty, Field, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { SchoolClass, Subject } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export default function Classes() {
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const subjects = useFetch<Subject[]>('/academic/subjects');
  const [classId, setClassId] = useState('');
  const activeId = classId || classes.data?.[0]?.id || '';
  const offered = useFetch<Subject[]>(activeId ? `/academic/classes/${activeId}/subjects` : null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => { setChecked(new Set(offered.data?.map((s) => s.id) ?? [])); }, [offered.data]);

  const addClass = useAction(); const [cf, setCf] = useState({ stage: 'JSS', year: '1', arm: '' });
  const addSubject = useAction(); const [sf, setSf] = useState({ name: '', code: '' });
  const save = useAction(); const [saved, setSaved] = useState(false);

  async function submitClass(e: FormEvent) {
    e.preventDefault();
    if (await addClass.run(() => api('/academic/classes', { body: { stage: cf.stage, year: Number(cf.year), arm: cf.arm.trim() || null } }))) {
      setCf({ ...cf, arm: '' }); classes.reload();
    }
  }
  async function submitSubject(e: FormEvent) {
    e.preventDefault();
    if (await addSubject.run(() => api('/academic/subjects', { body: { name: sf.name, ...(sf.code.trim() ? { code: sf.code.trim() } : {}) } }))) {
      setSf({ name: '', code: '' }); subjects.reload();
    }
  }
  async function saveSubjects() {
    setSaved(false);
    if (await save.run(() => api(`/academic/classes/${activeId}/subjects`, { method: 'PUT', body: { subjectIds: [...checked] } }))) { setSaved(true); offered.reload(); }
  }
  const toggle = (id: string) => { setSaved(false); setChecked((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  return (
    <>
      <PageHeader title="Classes and subjects" intro="Create the school's classes and subjects, then choose which subjects each class takes. Arms (such as the A in JSS 1A) are optional." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Classes">
          <DataState loading={classes.loading} error={classes.error}>
            {classes.data?.length ? (
              <div className="flex flex-wrap gap-2">{classes.data.map((c) => <span key={c.id} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-900">{c.name}</span>)}</div>
            ) : <Empty>No classes yet. Add JSS 1 to SSS 3 below.</Empty>}
          </DataState>
          <form onSubmit={submitClass} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3" noValidate>
            <Select label="Stage" value={cf.stage} onChange={(e) => setCf({ ...cf, stage: e.target.value })}><option value="JSS">JSS</option><option value="SSS">SSS</option></Select>
            <Select label="Year" value={cf.year} onChange={(e) => setCf({ ...cf, year: e.target.value })}><option>1</option><option>2</option><option>3</option></Select>
            <Field label="Arm (optional)" placeholder="A" value={cf.arm} error={addClass.fields.arm} onChange={(e) => setCf({ ...cf, arm: e.target.value })} />
            <div className="sm:col-span-3">
              {addClass.error && <div className="mb-3"><Alert tone="error">{addClass.error}</Alert></div>}
              <Button type="submit" loading={addClass.busy}>Add class</Button>
            </div>
          </form>
        </Card>

        <Card title="Subjects">
          <DataState loading={subjects.loading} error={subjects.error}>
            {subjects.data?.length ? (
              <Table><thead><tr><Th>Subject</Th><Th>Code</Th></tr></thead>
                <tbody>{subjects.data.map((s) => <tr key={s.id}><Td>{s.name}</Td><Td>{s.code ?? '-'}</Td></tr>)}</tbody></Table>
            ) : <Empty>No subjects yet.</Empty>}
          </DataState>
          <form onSubmit={submitSubject} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" noValidate>
            <Field label="Subject name" value={sf.name} error={addSubject.fields.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} />
            <Field label="Code (optional)" value={sf.code} error={addSubject.fields.code} onChange={(e) => setSf({ ...sf, code: e.target.value })} />
            <div className="sm:col-span-2">
              {addSubject.error && <div className="mb-3"><Alert tone="error">{addSubject.error}</Alert></div>}
              <Button type="submit" loading={addSubject.busy}>Add subject</Button>
            </div>
          </form>
        </Card>

        <div className="xl:col-span-2">
          <Card title="Subjects taken by a class">
            {!classes.data?.length || !subjects.data?.length ? <Empty>Add at least one class and one subject first.</Empty> : (
              <>
                <div className="max-w-xs"><Select label="Class" value={activeId} onChange={(e) => { setClassId(e.target.value); setSaved(false); }}>
                  {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select></div>
                <DataState loading={offered.loading} error={offered.error}>
                  <fieldset className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <legend className="sr-only">Subjects for this class</legend>
                    {subjects.data.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                        <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={checked.has(s.id)} onChange={() => toggle(s.id)} />
                        {s.name}
                      </label>
                    ))}
                  </fieldset>
                </DataState>
                {save.error && <div className="mt-4"><Alert tone="error">{save.error}</Alert></div>}
                {saved && <div className="mt-4"><Alert tone="success">Subjects saved.</Alert></div>}
                <div className="mt-4 max-w-xs"><Button onClick={saveSubjects} loading={save.busy}>Save subjects</Button></div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
