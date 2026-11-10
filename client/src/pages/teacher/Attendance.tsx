import { useState } from 'react';
import { Card, DataState, Empty, Field, PageHeader, Select } from '../../components/ui';
import RegisterEditor from '../../components/attendance/RegisterEditor';
import { AttendanceTabs } from '../../components/attendance/parts';
import { lagosToday } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';

export const useFormClasses = () => useFetch<{ classId: string; className: string }[]>('/teachers/me/form-classes');
const NotFormTeacher = () => <Card><Empty>You are not the form teacher of any class this session. The administrator assigns form teachers.</Empty></Card>;
export { NotFormTeacher };

// The form teacher's daily register.
export default function Attendance() {
  const today = lagosToday();
  const classes = useFormClasses();
  const [pick, setPick] = useState(''); const classId = pick || classes.data?.[0]?.classId || '';
  const [date, setDate] = useState(today);
  return (
    <>
      <PageHeader title="Attendance" intro="Take the daily register for your class. Everyone starts as present: change only the children who are late or absent, then save." />
      <AttendanceTabs role="teacher" />
      <DataState loading={classes.loading} error={classes.error}>
        {!classes.data?.length ? <NotFormTeacher /> : (
          <>
            <div className="mb-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
              <Select label="Class" value={classId} onChange={(e) => setPick(e.target.value)}>{classes.data.map((c) => <option key={c.classId} value={c.classId}>{c.className}</option>)}</Select>
              <Field label="Date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
            </div>
            {classId && date && <RegisterEditor key={`${classId}-${date}`} classId={classId} date={date} />}
          </>
        )}
      </DataState>
    </>
  );
}
