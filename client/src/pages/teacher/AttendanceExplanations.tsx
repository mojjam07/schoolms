import { PageHeader } from '../../components/ui';
import ExplanationQueue from '../../components/attendance/ExplanationQueue';
import { AttendanceTabs } from '../../components/attendance/parts';

export default function TeacherExplanations() {
  return (
    <>
      <PageHeader title="Absence explanations" intro="Reasons parents have sent for days their child was marked absent or late. Accept or decline each one; the parent sees your reply." />
      <AttendanceTabs role="teacher" />
      <ExplanationQueue />
    </>
  );
}
