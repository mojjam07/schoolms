import { Link } from 'react-router-dom';
import ChildOverview, { type ChildData } from '../../components/ChildOverview';
import { DataState, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/useFetch';

export default function StudentDashboard() {
  const d = useFetch<ChildData & { unreadNotifications: number }>('/dashboard/student');
  return (
    <>
      <PageHeader title="Home" intro="Your day at a glance." />
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <>
            {d.data.unreadNotifications > 0 && <p className="mb-4 rounded-lg border border-line bg-brand-50 p-3 text-sm"><Link className="text-brand-700 underline" to="/student/notifications">You have {d.data.unreadNotifications} unread notification{d.data.unreadNotifications === 1 ? '' : 's'}.</Link></p>}
            <ChildOverview d={d.data} base="/student" />
            <p className="mt-4 text-sm"><Link className="text-brand-700 underline" to="/student/learning">Go to your lessons and notes</Link></p>
          </>
        )}
      </DataState>
    </>
  );
}
