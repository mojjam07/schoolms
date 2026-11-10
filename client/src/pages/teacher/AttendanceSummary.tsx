import { DataState, PageHeader } from '../../components/ui';
import ClassSummary from '../../components/attendance/ClassSummary';
import { AttendanceTabs } from '../../components/attendance/parts';
import { NotFormTeacher, useFormClasses } from './Attendance';

export default function TeacherAttendanceSummary() {
  const classes = useFormClasses();
  return (
    <>
      <PageHeader title="Class attendance summary" intro="How often each child in your class was present, late or absent in a term." />
      <AttendanceTabs role="teacher" />
      <DataState loading={classes.loading} error={classes.error}>
        {classes.data?.length ? <ClassSummary classes={classes.data} /> : <NotFormTeacher />}
      </DataState>
    </>
  );
}
