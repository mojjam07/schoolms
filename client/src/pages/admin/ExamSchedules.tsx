import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, TextArea } from '../../components/ui';
import { ExamList } from '../../components/schedule/parts';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { ExamPaper, ExamScheduleFull, ExamScheduleRow, SchoolClass, Subject } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';
import { useTerms } from '../../lib/useTerms';

function PaperForm({ schedule, onDone }: { schedule: ExamScheduleFull; onDone: () => void }) {
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const [classId, setClassId] = useState('');
  const cid = classId || classes.data?.[0]?.id || '';
  const subjects = useFetch<Subject[]>(cid ? `/academic/classes/${cid}/subjects` : null);
  const [subjectId, setSubjectId] = useState(''); const [date, setDate] = useState(''); const [start, setStart] = useState('09:00'); const [end, setEnd] = useState('11:00'); const [venue, setVenue] = useState(''); const [ins, setIns] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await act.run(() => api(`/exam-schedules/${schedule.id}/papers`, { body: { classId: cid, subjectId: subjectId || subjects.data?.[0]?.id, date, startTime: start, endTime: end, venue: venue || null, instructions: ins || null } }))) { setVenue(''); setIns(''); onDone(); }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Select label="Class" value={cid} onChange={(e) => { setClassId(e.target.value); setSubjectId(''); }}>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Select label="Subject" value={subjectId || subjects.data?.[0]?.id || ''} onChange={(e) => setSubjectId(e.target.value)}>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Field label="Venue (optional)" value={venue} maxLength={80} onChange={(e) => setVenue(e.target.value)} />
      <Field label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
      <Field label="Ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
      <div className="sm:col-span-2"><TextArea label="Instructions (optional)" rows={2} maxLength={500} value={ins} onChange={(e) => setIns(e.target.value)} /></div>
      <div className="sm:col-span-2">{act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}<Button loading={act.busy} disabled={!cid || !date}>Add paper</Button></div>
    </form>
  );
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const d = useFetch<ExamScheduleFull>(`/exam-schedules/${id}`);
  const act = useAction();
  const refresh = () => { d.reload(); onChanged(); };
  const s = d.data;
  async function toggle() { if (s && await act.run(() => api(`/exam-schedules/${id}/${s.isPublished ? 'unpublish' : 'publish'}`, { method: 'POST' }))) refresh(); }
  async function removePaper(p: ExamPaper) { if (await act.run(() => api(`/exam-papers/${p.id}`, { method: 'DELETE' }))) refresh(); }
  async function removeSchedule() { if (await act.run(() => api(`/exam-schedules/${id}`, { method: 'DELETE' }))) onChanged(); }
  return (
    <DataState loading={d.loading && !d.data} error={d.error}>
      {s && (
        <div className="space-y-6">
          <Card title={s.title} action={s.isPublished ? <Badge tone="good">Published</Badge> : <Badge tone="warn">Draft: not visible to anyone</Badge>}>
            <p className="mb-3 text-sm text-muted">{s.sessionName} · {s.termName}{s.publishedAt ? ` · first published ${fmtDate(s.publishedAt.slice(0, 10))}` : ''}</p>
            {act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}
            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={toggle} disabled={act.busy}>{s.isPublished ? 'Unpublish' : 'Publish to students, parents and teachers'}</SmallButton>
              {!s.isPublished && <SmallButton tone="danger" onClick={removeSchedule} disabled={act.busy}>Delete schedule</SmallButton>}
            </div>
            {s.isPublished && <p className="mt-3 text-sm text-muted">Changes to dates, times or venues, new papers and removed papers notify the class's students, parents and teachers.</p>}
          </Card>
          <Card title="Papers">
            {s.papers.length ? (
              <ul className="divide-y divide-line">
                {s.papers.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span><span className="font-medium">{p.subjectName}</span> · {p.className}<br /><span className="text-sm text-muted">{fmtDate(p.date)}, {p.startTime} to {p.endTime}{p.venue ? ` · ${p.venue}` : ''}</span></span>
                    <SmallButton tone="danger" onClick={() => removePaper(p)} disabled={act.busy}>Remove</SmallButton>
                  </li>
                ))}
              </ul>
            ) : <Empty>No papers yet.</Empty>}
          </Card>
          <Card title="Add a paper"><PaperForm schedule={s} onDone={refresh} /></Card>
          {!!s.papers.length && <Card title="How families will see it"><ExamList papers={s.papers} showClass emptyText="" /></Card>}
        </div>
      )}
    </DataState>
  );
}

export default function ExamSchedules() {
  const { terms, label, defaultId, loading: termsLoading, error: termsError } = useTerms();
  const list = useFetch<ExamScheduleRow[]>('/exam-schedules');
  const [open, setOpen] = useState<string | null>(null);
  const [termId, setTermId] = useState(''); const [title, setTitle] = useState('');
  const act = useAction();
  async function create(e: FormEvent) {
    e.preventDefault();
    let created: ExamScheduleFull | null = null;
    if (await act.run(async () => { created = await api<ExamScheduleFull>('/exam-schedules', { body: { termId: termId || defaultId, title } }); })) { setTitle(''); list.reload(); if (created) setOpen((created as ExamScheduleFull).id); }
  }
  return (
    <>
      <PageHeader title="Exam schedules" intro="Build the examination timetable for a term as a draft, then publish it. Nothing is visible to students, parents or teachers until you publish." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-6">
          <Card title="New schedule">
            <form onSubmit={create} className="space-y-4">
              <DataState loading={termsLoading} error={termsError}>
                <Select label="Term" value={termId || defaultId} onChange={(e) => setTermId(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select>
              </DataState>
              <Field label="Title" value={title} maxLength={120} placeholder="First term examinations" onChange={(e) => setTitle(e.target.value)} required />
              {act.error && <Alert tone="error">{act.error}</Alert>}
              <Button loading={act.busy} disabled={!terms.length}>Create draft</Button>
            </form>
          </Card>
          <Card title="Schedules">
            <DataState loading={list.loading && !list.data} error={list.error}>
              {list.data?.length ? (
                <ul className="divide-y divide-line">
                  {list.data.map((s) => (
                    <li key={s.id}><button onClick={() => setOpen(s.id)} className={`w-full py-2.5 text-left ${open === s.id ? 'font-semibold' : ''}`}>
                      {s.title}<br /><span className="text-sm font-normal text-muted">{s.sessionName} · {s.termName} · {s.paperCount} paper{s.paperCount === 1 ? '' : 's'} · {s.isPublished ? 'published' : 'draft'}</span>
                    </button></li>
                  ))}
                </ul>
              ) : <Empty>No schedules yet.</Empty>}
            </DataState>
          </Card>
        </div>
        <div>{open ? <Detail key={open} id={open} onChanged={list.reload} /> : <Card><Empty>Choose a schedule, or create one, to add papers.</Empty></Card>}</div>
      </div>
    </>
  );
}
