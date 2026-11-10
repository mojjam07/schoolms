import { useState } from 'react';
import { Badge, Card, DataState, Empty, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { Stat } from '../../components/attendance/parts';
import { fmtDay } from '../../lib/format';
import type { AttendanceSummary } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';
import { useTerms } from '../../lib/useTerms';

// Read only: the student's own record for a term. Explaining an absence is for parents.
export default function StudentAttendance() {
  const t = useTerms(); const [pick, setPick] = useState(''); const termId = pick || t.defaultId;
  const data = useFetch<{ summary: AttendanceSummary; days: { date: string; status: 'late' | 'absent' }[] }>(termId ? `/students/me/attendance?termId=${termId}` : null);
  const s = data.data?.summary; const days = data.data?.days ?? [];
  return (
    <>
      <PageHeader title="My attendance" intro="Your daily attendance for each term. If a day is wrong, tell your form teacher. Your parent or guardian can send the school a reason for a day you missed." />
      <DataState loading={t.loading} error={t.error}>
        {!t.terms.length ? <Card><Empty>The school has not set up its terms yet.</Empty></Card> : (
          <>
            <div className="mb-6 sm:max-w-xs"><Select label="Term" value={termId} onChange={(e) => setPick(e.target.value)}>{t.terms.map((x) => <option key={x.id} value={x.id}>{t.label(x)}</option>)}</Select></div>
            <DataState loading={data.loading && !data.data} error={data.error}>
              {s && !s.opened ? <Card><Empty>No attendance has been recorded for you in this term yet.</Empty></Card> : s && (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Stat label="School days" value={s.opened} hint="register taken" />
                    <Stat label="Present" value={s.present} hint={s.late ? `including ${s.late} late` : undefined} />
                    <Stat label="Late" value={s.late} />
                    <Stat label="Absent" value={s.absent} hint={s.excused ? `${s.excused} excused` : undefined} />
                    <Stat label="Attendance" value={s.percentPresent === null ? '-' : `${s.percentPresent}%`} />
                  </div>
                  <Card title="Days missed or late">
                    {days.length ? (
                      <Table><thead><tr><Th>Day</Th><Th>Recorded as</Th></tr></thead>
                        <tbody>{days.map((d) => <tr key={d.date}><Td className="whitespace-nowrap font-medium">{fmtDay(d.date)}</Td><Td><Badge tone={d.status === 'absent' ? 'bad' : 'warn'}>{d.status === 'absent' ? 'Absent' : 'Late'}</Badge></Td></tr>)}</tbody></Table>
                    ) : <Empty>You have no absences or late arrivals this term.</Empty>}
                  </Card>
                </div>
              )}
            </DataState>
          </>
        )}
      </DataState>
    </>
  );
}
