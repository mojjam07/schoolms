import { DataState, PageHeader } from '../../components/ui';
import ClassSummary from '../../components/attendance/ClassSummary';
import { AttendanceTabs } from '../../components/attendance/parts';
import type { SchoolClass } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export default function AdminAttendanceSummary() {
  const classes = useFetch<SchoolClass[]>('/academic/classes');
  return (
    <>
      <PageHeader title="Class attendance summary" intro="A term's attendance for any class." />
      <AttendanceTabs role="admin" />
      <DataState loading={classes.loading} error={classes.error}>
        <ClassSummary classes={(classes.data ?? []).map((c) => ({ classId: c.id, className: c.name }))} />
      </DataState>
    </>
  );
}
