import { PageHeader } from '../../components/ui';
import ExplanationQueue from '../../components/attendance/ExplanationQueue';
import { AttendanceTabs } from '../../components/attendance/parts';

export default function AdminExplanations() {
  return (
    <>
      <PageHeader title="Absence explanations" intro="Explanations from parents for every class. Form teachers see their own class; you can reply to any of them." />
      <AttendanceTabs role="admin" />
      <ExplanationQueue />
    </>
  );
}
