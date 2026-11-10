import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, SmallButton } from '../ui';
import { api } from '../../lib/api';
import { messageOf } from '../../lib/forms';
import { fmtDayLong } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';

type Status = 'present' | 'late' | 'absent';
interface Register { classId: string; className: string; date: string; taken: boolean; termId: string; locked: boolean; students: { studentId: string; name: string; admissionNumber: string | null; status: Status | null }[] }
const OPTIONS: [Status, string][] = [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent']];

// One class, one day. Everyone starts as present, so only the exceptions need marking.
// Used by the form teacher (own class, last 7 days) and the administrator (any class, any day): the API decides who may save.
export default function RegisterEditor({ classId, date }: { classId: string; date: string }) {
  const reg = useFetch<Register>(`/attendance/register?classId=${classId}&date=${date}`);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const r = reg.data;
  useEffect(() => { if (r) setMarks(Object.fromEntries(r.students.map((s) => [s.studentId, s.status ?? 'present']))); }, [r]);
  const counts = useMemo(() => ({ present: Object.values(marks).filter((m) => m === 'present').length, late: Object.values(marks).filter((m) => m === 'late').length, absent: Object.values(marks).filter((m) => m === 'absent').length }), [marks]);
  const dirty = !!r && (!r.taken || r.students.some((s) => (s.status ?? 'present') !== marks[s.studentId]));
  const change = (fn: () => void) => { setMsg(''); setError(''); fn(); };

  async function save() {
    if (!r) return;
    setSaving(true); setError(''); setMsg('');
    try {
      await api('/attendance/register', { method: 'PUT', body: { classId, date, entries: r.students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] ?? 'present' })) } });
      setMsg('Register saved. Parents of any child marked absent or late have been notified.'); reg.reload();
    } catch (e) { setError(messageOf(e)); } finally { setSaving(false); }
  }

  return (
    <DataState loading={reg.loading && !r} error={reg.error}>
      {r && (
        <Card title={`${r.className} · ${fmtDayLong(r.date)}`} action={r.taken ? <Badge tone="good">Register taken</Badge> : <Badge tone="warn">Not taken yet</Badge>}>
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
  );
}
