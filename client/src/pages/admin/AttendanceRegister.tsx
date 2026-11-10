import { useSearchParams } from 'react-router-dom';
import { Card, DataState, Empty, Field, PageHeader, Select } from '../../components/ui';
import RegisterEditor from '../../components/attendance/RegisterEditor';
import { AttendanceTabs } from '../../components/attendance/parts';
import { lagosToday } from '../../lib/format';
import type { SchoolClass } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

// The administrator can take a register for any class and correct one of any age (form teachers are limited to 7 days).
export default function AttendanceRegister() {
  const today = lagosToday(); const [sp, setSp] = useSearchParams();
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  const classId = sp.get('classId') || classes.data?.[0]?.id || ''; const date = sp.get('date') || today;
  const set = (k: 'classId' | 'date', v: string) => { const n = new URLSearchParams(sp); n.set('classId', classId); n.set('date', date); n.set(k, v); setSp(n, { replace: true }); };
  return (
    <>
      <PageHeader title="Take or correct a register" intro="Choose any class and day. Corrections are recorded in the audit log, and parents are told if a child's mark changes to late or absent." />
      <AttendanceTabs role="admin" />
      <DataState loading={classes.loading} error={classes.error}>
        {!classes.data?.length ? <Card><Empty>No classes have been set up yet.</Empty></Card> : (
          <>
            <div className="mb-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <Select label="Class" value={classId} onChange={(e) => set('classId', e.target.value)}>{classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Field label="Date" type="date" max={today} value={date} onChange={(e) => set('date', e.target.value || today)} />
            </div>
            {classId && <RegisterEditor key={`${classId}-${date}`} classId={classId} date={date} />}
          </>
        )}
      </DataState>
    </>
  );
}
