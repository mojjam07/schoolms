import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, PageHeader, Select, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Child, Session, Term } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

interface Explanation { id: string; status: 'pending' | 'accepted' | 'declined'; reason: string; reviewNote: string | null }
interface Day { date: string; status: 'late' | 'absent'; explanation: Explanation | null }
interface Summary { opened: number; present: number; onTime: number; late: number; absent: number; excused: number; unexplainedAbsent: number; percentPresent: number | null }
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>;
}

function ChildAttendance({ child, termId }: { child: Child; termId: string }) {
  const data = useFetch<{ summary: Summary; days: Day[] }>(`/parents/me/children/${child.id}/attendance?termId=${termId}`);
  const [open, setOpen] = useState<string | null>(null); const [reason, setReason] = useState(''); const [msg, setMsg] = useState('');
  const act = useAction();

  function start(d: Day) { setMsg(''); act.clear(); setOpen(d.date); setReason(d.explanation?.status === 'pending' ? d.explanation.reason : ''); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg('');
    if (await act.run(() => api(`/parents/me/children/${child.id}/explanations`, { body: { date: open, reason } }))) { setOpen(null); setReason(''); setMsg('Explanation sent. The form teacher has been told and will reply here.'); data.reload(); }
  }

  const s = data.data?.summary; const days = data.data?.days ?? [];
  return (
    <DataState loading={data.loading && !data.data} error={data.error}>
      {s && !s.opened ? <Card><Empty>No attendance has been recorded for {child.firstName} in this term yet.</Empty></Card> : s && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="School days" value={s.opened} hint="register taken" />
            <Stat label="Present" value={s.present} hint={s.late ? `including ${s.late} late` : undefined} />
            <Stat label="Late" value={s.late} />
            <Stat label="Absent" value={s.absent} hint={s.excused ? `${s.excused} excused` : undefined} />
            <Stat label="Attendance" value={s.percentPresent === null ? '-' : `${s.percentPresent}%`} />
          </div>
          {msg && <Alert tone="success">{msg}</Alert>}
          <Card title="Days missed or late">
            {days.length ? (
              <Table>
                <thead><tr><Th>Day</Th><Th>Recorded as</Th><Th>Reason you gave</Th><Th /></tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <Td className="whitespace-nowrap font-medium">{fmt(d.date)}</Td>
                      <Td><Badge tone={d.status === 'absent' ? 'bad' : 'warn'}>{d.status === 'absent' ? 'Absent' : 'Late'}</Badge></Td>
                      <Td>
                        {!d.explanation && <span className="text-muted">No reason given yet</span>}
                        {d.explanation && (
                          <div className="space-y-1">
                            <p className="break-words">{d.explanation.reason}</p>
                            {d.explanation.status === 'pending' && <Badge tone="neutral">Waiting for the school</Badge>}
                            {d.explanation.status === 'accepted' && <Badge tone="good">Accepted</Badge>}
                            {d.explanation.status === 'declined' && <Badge tone="bad">Not accepted</Badge>}
                            {d.explanation.reviewNote && <p className="text-sm text-muted">School's reply: {d.explanation.reviewNote}</p>}
                          </div>
                        )}
                      </Td>
                      <Td className="text-right">
                        {(!d.explanation || d.explanation.status === 'pending') && <SmallButton onClick={() => start(d)}>{d.explanation ? 'Edit' : 'Explain'}</SmallButton>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <Empty>{child.firstName} has no absences or late arrivals this term.</Empty>}
            {open && (
              <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-5 lg:max-w-xl" noValidate>
                <p className="font-medium">Why was {child.firstName} {days.find((x) => x.date === open)?.status === 'late' ? 'late' : 'absent'} on {fmt(open)}?</p>
                <TextArea label="Reason" rows={3} value={reason} error={act.fields.reason} hint="For example: he had malaria and was at the clinic. Up to 500 characters." onChange={(e) => setReason(e.target.value)} />
                {act.error && !act.fields.reason && <Alert tone="error">{act.error}</Alert>}
                <div className="flex flex-wrap gap-3"><div className="w-48"><Button type="submit" loading={act.busy} disabled={reason.trim().length < 3}>Send to the school</Button></div><button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-line px-4 py-2.5 font-medium">Cancel</button></div>
              </form>
            )}
            <p className="mt-4 text-sm text-muted">The school's register is the official record. Your reason is shown beside it and, once accepted, the absence counts as excused. You can only explain days the school marked absent or late.</p>
          </Card>
        </div>
      )}
    </DataState>
  );
}

export default function ParentAttendance() {
  const kids = useFetch<Child[]>('/parents/me/children');
  const sessions = useFetch<Session[]>('/academic/sessions'); const termsQ = useFetch<Term[]>('/academic/terms');
  const terms = [...(termsQ.data ?? [])].sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
  const label = (t: Term) => `${sessions.data?.find((s) => s.id === t.sessionId)?.name ?? ''} · ${t.name}`;
  const [kidPick, setKidPick] = useState(''); const kid = kids.data?.find((k) => k.id === kidPick) ?? kids.data?.[0];
  const [termPick, setTermPick] = useState(''); const tid = termPick || (terms.find((t) => t.isCurrent) ?? terms[0])?.id || '';

  return (
    <>
      <PageHeader title="Attendance" intro="Your child's daily attendance, and a place to tell the school why they were away." />
      <DataState loading={kids.loading || termsQ.loading} error={kids.error || termsQ.error}>
        {!kids.data?.length ? <Card><Empty>No children are linked to your account yet. Please contact the school office.</Empty></Card> : !terms.length ? <Card><Empty>The school has not set up its terms yet.</Empty></Card> : (
          <>
            <div className="mb-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
              {kids.data.length > 1 && <Select label="Child" value={kid?.id ?? ''} onChange={(e) => setKidPick(e.target.value)}>{kids.data.map((k) => <option key={k.id} value={k.id}>{k.firstName} {k.lastName}</option>)}</Select>}
              <Select label="Term" value={tid} onChange={(e) => setTermPick(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}</Select>
            </div>
            {kid && <ChildAttendance key={`${kid.id}-${tid}`} child={kid} termId={tid} />}
          </>
        )}
      </DataState>
    </>
  );
}
