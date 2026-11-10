import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, PageHeader, Select, SmallButton } from '../../components/ui';
import { api } from '../../lib/api';
import type { RolloverPreview, SchoolClass, Session } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

interface Result { promoted: number; repeated: number; graduated: number; excluded: number; alreadyPlaced: number; classesCreated: string[]; formTeachersCarried: number; assignmentsCarried: number; timetableSlotsCarried: number; skippedTeachers: string[] }

const outcomeLabel = { promote: 'Moves up', repeat: 'Repeats', graduate: 'Graduates', 'skip-excluded': 'Left out', 'skip-already': 'Already placed' } as const;

export default function Rollover() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const ordered = [...(sessions.data ?? [])].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const fromId = from || sessions.data?.find((s) => s.isCurrent)?.id || ordered[0]?.id || '';
  const toId = to || ordered.find((s) => s.startDate > (sessions.data?.find((x) => x.id === fromId)?.startDate ?? ''))?.id || '';

  const [classMap, setClassMap] = useState<Record<string, string>>({});
  const [repeat, setRepeat] = useState<Set<string>>(new Set()); const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [create, setCreate] = useState(false); const [carryForm, setCarryForm] = useState(true); const [carryTeach, setCarryTeach] = useState(true); const [carryTime, setCarryTime] = useState(false);
  const [preview, setPreview] = useState<RolloverPreview | null>(null); const [result, setResult] = useState<Result | null>(null);
  const pv = useAction(); const run = useAction();

  const body = () => ({ fromSessionId: fromId, toSessionId: toId, classMap, repeatStudentIds: [...repeat], excludeStudentIds: [...exclude], createMissingClasses: create, carryFormTeachers: carryForm, carryTeachingAssignments: carryTeach, carryTimetable: carryTime });
  const doPreview = () => pv.run(async () => { setResult(null); setPreview(await api<RolloverPreview>('/rollover/preview', { body: body() })); });
  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, other: Set<string>, setOther: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setSet(n);
    if (other.has(id)) { const o = new Set(other); o.delete(id); setOther(o); }
    setPreview(null);
  };
  async function go() {
    if (!window.confirm(`Promote students from ${preview?.fromSession} to ${preview?.toSession}? This cannot be repeated.`)) return;
    if (await run.run(async () => { setResult(await api<Result>('/rollover/run', { body: body() })); setPreview(null); })) { /* shown below */ }
  }
  const t = preview?.totals;
  const check = (label: string, v: boolean, set: (b: boolean) => void) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v} onChange={(e) => { set(e.target.checked); setPreview(null); }} /> {label}</label>;

  return (
    <>
      <PageHeader title="New session promotion" intro="Move students up to the next class at the start of a new session. Create the new session and its terms first, then preview, check, and run. Nothing changes until you press Run." />
      <div className="space-y-6">
        <Card title="1. Choose the sessions">
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <Select label="Promote from" value={fromId} onChange={(e) => { setFrom(e.target.value); setTo(''); setPreview(null); }}>{ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select label="Promote into" value={toId} onChange={(e) => { setTo(e.target.value); setPreview(null); }}><option value="">Choose…</option>{ordered.filter((s) => s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </div>
          <div className="mt-4 space-y-2">
            {check('Create missing classes (for example SSS 1 when moving up from JSS 3)', create, setCreate)}
            {check('Carry over form teachers (same class, active teachers only)', carryForm, setCarryForm)}
            {check('Carry over teaching assignments (active teachers only)', carryTeach, setCarryTeach)}
            {check('Copy the timetable', carryTime, setCarryTime)}
          </div>
          <div className="mt-4 max-w-xs"><Button loading={pv.busy} disabled={!fromId || !toId} onClick={doPreview}>Preview</Button></div>
          {pv.error && <div className="mt-3"><Alert tone="error">{pv.error}</Alert></div>}
        </Card>

        {result && (
          <Alert tone="success">
            <p className="font-semibold">Promotion complete.</p>
            <p>{result.promoted} moved up, {result.repeated} repeating, {result.graduated} graduated{result.excluded ? `, ${result.excluded} left out` : ''}{result.alreadyPlaced ? `, ${result.alreadyPlaced} already placed` : ''}.
              {result.classesCreated.length ? ` Created: ${result.classesCreated.join(', ')}.` : ''} Carried over {result.formTeachersCarried} form teacher(s), {result.assignmentsCarried} teaching assignment(s){result.timetableSlotsCarried ? `, ${result.timetableSlotsCarried} timetable lesson(s)` : ''}.
              {result.skippedTeachers.length ? ` Not carried because the account is not active: ${result.skippedTeachers.join(', ')}.` : ''}</p>
            <p className="mt-1">Remember to make the new session current under Sessions and terms, then set fees, form teachers and the grading columns for it.</p>
          </Alert>
        )}

        {preview && t && (
          <Card title="2. Check the plan">
            {preview.alreadyDone && <div className="mb-4"><Alert tone="error">This promotion has already been done.</Alert></div>}
            {preview.blockers.map((b) => <div key={b} className="mb-2"><Alert tone="error">{b}</Alert></div>)}
            <p className="mb-4 text-sm">{t.promote} move up · {t.repeat} repeat · {t.graduate} graduate · {t.excluded} left out · {t.alreadyPlaced} already placed in {preview.toSession}.
              {preview.classesToCreate.length ? ` Will create: ${preview.classesToCreate.join(', ')}.` : ''}</p>
            {!preview.classes.length && <Empty>There are no active students in {preview.fromSession}.</Empty>}
            <div className="space-y-5">
              {preview.classes.map((c) => (
                <div key={c.fromClassId} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                    <h3 className="font-semibold">{c.fromClassName} <span className="font-normal text-muted">({c.students.length} students)</span></h3>
                    <div className="min-w-[12rem]">
                      <Select label="Moves to" value={classMap[c.fromClassId] ?? (c.target ? (c.target.graduate ? 'graduate' : c.target.classId ?? '') : '')}
                        onChange={(e) => { const m = { ...classMap }; if (e.target.value) m[c.fromClassId] = e.target.value; else delete m[c.fromClassId]; setClassMap(m); setPreview(null); }}>
                        <option value="">{c.target ? `${c.target.className}${c.target.willBeCreated ? ' (will be created)' : ''} (suggested)` : 'Not decided'}</option>
                        <option value="graduate">Graduate</option>
                        {classes.data?.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </Select>
                    </div>
                  </div>
                  <ul className="divide-y divide-line text-sm">
                    {c.students.map((s) => (
                      <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span>{s.name}{s.admissionNumber ? <span className="text-muted"> · {s.admissionNumber}</span> : ''}</span>
                        <span className="flex items-center gap-2">
                          <Badge tone={s.outcome === 'promote' || s.outcome === 'graduate' ? 'good' : s.outcome === 'repeat' ? 'warn' : 'neutral'}>{outcomeLabel[s.outcome]}</Badge>
                          {s.outcome !== 'skip-already' && <>
                            <SmallButton onClick={() => toggle(repeat, setRepeat, exclude, setExclude, s.studentId)}>{repeat.has(s.studentId) ? 'Undo repeat' : 'Repeat class'}</SmallButton>
                            <SmallButton onClick={() => toggle(exclude, setExclude, repeat, setRepeat, s.studentId)}>{exclude.has(s.studentId) ? 'Undo' : 'Leave out'}</SmallButton>
                          </>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">After changing a choice, press Preview again. Students who are left out keep their old-session record and are not placed in the new session, so you can place them later under Students and classes.</p>
            <div className="mt-4 max-w-xs"><Button loading={run.busy} disabled={!preview.canRun} onClick={go}>Run promotion</Button></div>
            {run.error && <div className="mt-3"><Alert tone="error">{run.error}</Alert></div>}
          </Card>
        )}
      </div>
    </>
  );
}
