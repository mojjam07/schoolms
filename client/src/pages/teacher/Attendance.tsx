import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton } from '../../components/ui';
import { api } from '../../lib/api';
import { messageOf } from '../../lib/forms';
import { useFetch } from '../../lib/useFetch';

type Status = 'present' | 'late' | 'absent';
interface Register { classId: string; className: string; date: string; taken: boolean; termId: string; locked: boolean; students: { studentId: string; name: string; admissionNumber: string | null; status: Status | null }[] }
const OPTIONS: [Status, string][] = [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent']];
const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

// The form teacher's daily register: everyone starts as present, so only the exceptions need marking.
export default function Attendance() {
  const today = lagosToday();
  const classes = useFetch<{ classId: string; className: string }[]>('/teachers/me/form-classes');
  const [pick, setPick] = useState(''); const classId = pick || classes.data?.[0]?.classId || '';
  const [date, setDate] = useState(today);
  const reg = useFetch<Register>(classId && date ? `/attendance/register?classId=${classId}&date=${date}` : null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [msg, setMsg] = useState('');

  const r = reg.data;
  useEffect(() => { if (r) setMarks(Object.fromEntries(r.students.map((s) => [s.studentId, s.status ?? 'present']))); }, [r]);
  const counts = useMemo(() => ({ present: Object.values(marks).filter((m) => m === 'present').length, late: Object.values(marks).filter((m) => m === 'late').length, absent: Object.values(marks).filter((m) => m === 'absent').length }), [marks]);
  const dirty = !!r && (!r.taken || r.students.some((s) => (s.status ?? 'present') !== marks[s.studentId]));

  async function save() {
    if (!r) return;
    setSaving(true); setError(''); setMsg('');
    try {
      await api('/attendance/register', { method: 'PUT', body: { classId, date, entries: r.students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] ?? 'present' })) } });
      setMsg('Register saved. Parents of any child marked absent or late have been notified.'); reg.reload();
    } catch (e) { setError(messageOf(e)); } finally { setSaving(false); }
  }
  const change = (setter: () => void) => { setMsg(''); setError(''); setter(); };

  return (
    <>
      <PageHeader title="Attendance" intro="Take the daily register for your class. Everyone starts as present: change only the children who are late or absent, then save." />
      <DataState loading={classes.loading} error={classes.error}>
        {!classes.data?.length ? <Card><Empty>You are not the form teacher of any class this session. The administrator assigns form teachers.</Empty></Card> : (
          <>
            <div className="mb-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <Select label="Class" value={classId} onChange={(e) => change(() => setPick(e.target.value))}>{classes.data.map((c) => <option key={c.classId} value={c.classId}>{c.className}</option>)}</Select>
              <Field label="Date" type="date" max={today} value={date} onChange={(e) => change(() => setDate(e.target.value || today))} />
            </div>
            <DataState loading={reg.loading && !r} error={reg.error}>
              {r && (
                <Card title={`${r.className} · ${new Date(r.date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                  action={r.taken ? <Badge tone="good">Register taken</Badge> : <Badge tone="warn">Not taken yet</Badge>}>
                  {r.locked && <div className="mb-4"><Alert tone="error">This register is more than 7 days old, so it can no longer be changed here. Ask the administrator to correct it.</Alert></div>}
                  {r.students.length ? (
                    <>
                      {!r.locked && <div className="mb-3"><SmallButton onClick={() => change(() => setMarks(Object.fromEntries(r.students.map((s) => [s.studentId, 'present' as Status]))))}>Mark everyone present</SmallButton></div>}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
                          <thead><tr className="bg-brand-50"><th className="border border-line px-2 py-2">Student</th>{OPTIONS.map(([k, l]) => <th key={k} className="border border-line px-2 py-2 text-center">{l}</th>)}</tr></thead>
                          <tbody>{r.students.map((s) => (
                            <tr key={s.studentId} className={marks[s.studentId] === 'absent' ? 'bg-red-50' : marks[s.studentId] === 'late' ? 'bg-gold-100' : ''}>
                              <td className="border border-line px-2 py-2"><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.admissionNumber}</div></td>
                              {OPTIONS.map(([k, l]) => (
                                <td key={k} className="border border-line p-0 text-center">
                                  <label className="flex h-full min-h-[3rem] cursor-pointer items-center justify-center px-3">
                                    <input type="radio" name={`att-${s.studentId}`} aria-label={`${s.name}, ${l}`} disabled={r.locked} checked={marks[s.studentId] === k}
                                      onChange={() => change(() => setMarks({ ...marks, [s.studentId]: k }))} className="h-5 w-5 accent-brand-500" />
                                  </label>
                                </td>
                              ))}
                            </tr>))}</tbody>
                        </table>
                      </div>
                      <p className="mt-4 text-sm"><strong>Present {counts.present}</strong> · Late {counts.late} · Absent {counts.absent} · {r.students.length} students</p>
                      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
                      {msg && <div className="mt-4"><Alert tone="success">{msg}</Alert></div>}
                      {!r.locked && (
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <div className="w-48"><Button onClick={save} loading={saving} disabled={!dirty}>{r.taken ? 'Save changes' : 'Save register'}</Button></div>
                          {dirty && <span className="text-sm text-muted">{r.taken ? 'Unsaved changes' : 'Not saved yet'}</span>}
                        </div>
                      )}
                    </>
                  ) : <Empty>No students are in this class yet.</Empty>}
                </Card>
              )}
            </DataState>
          </>
        )}
      </DataState>
    </>
  );
}
