import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, DataState, Empty, Field, PageHeader, Table, Td, Th } from '../../components/ui';
import { AttendanceTabs, Stat } from '../../components/attendance/parts';
import { fmtDayLong, lagosToday } from '../../lib/format';
import type { DayStatusRow } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

// Which classes have had their register taken on a day, and the counts.
export default function AttendanceOverview() {
  const today = lagosToday(); const [date, setDate] = useState(today);
  const rows = useFetch<DayStatusRow[]>(`/attendance/status?date=${date}`);
  const list = rows.data ?? []; const taken = list.filter((r) => r.taken);
  const sum = (k: 'present' | 'late' | 'absent') => taken.reduce((n, r) => n + r[k], 0);
  return (
    <>
      <PageHeader title="Attendance" intro="Which classes have taken their register, and how many children are present, late or absent." />
      <AttendanceTabs role="admin" />
      <div className="mb-6 sm:max-w-xs"><Field label="Date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} /></div>
      <DataState loading={rows.loading && !rows.data} error={rows.error}>
        {!list.length ? <Card><Empty>No classes have students enrolled for the session this date falls in.</Empty></Card> : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Registers taken" value={`${taken.length} of ${list.length}`} hint="classes" />
              <Stat label="Present" value={sum('present')} hint="on time" />
              <Stat label="Late" value={sum('late')} />
              <Stat label="Absent" value={sum('absent')} />
            </div>
            <Card title={fmtDayLong(date)}>
              <Table>
                <thead><tr><Th>Class</Th><Th>Form teacher</Th><Th>Register</Th><Th>Present</Th><Th>Late</Th><Th>Absent</Th><Th /></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.classId}>
                    <Td className="font-medium">{r.className}</Td>
                    <Td>{r.formTeacher ?? <Badge tone="warn">None assigned</Badge>}</Td>
                    <Td>{r.taken ? <Badge tone="good">Taken</Badge> : <Badge tone="warn">Not taken</Badge>}</Td>
                    <Td>{r.taken ? r.present : '-'}</Td><Td>{r.taken ? r.late : '-'}</Td><Td>{r.taken ? r.absent : '-'}</Td>
                    <Td className="whitespace-nowrap text-right"><Link className="font-medium text-brand-700 underline" to={`/admin/attendance/register?classId=${r.classId}&date=${date}`}>{r.taken ? 'Correct' : 'Take register'}</Link></Td>
                  </tr>))}</tbody>
              </Table>
            </Card>
          </div>
        )}
      </DataState>
    </>
  );
}
