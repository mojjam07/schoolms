import { Link } from 'react-router-dom';
import { Card, DataState, PageHeader } from '../../components/ui';
import type { Paged, Session, StudentRow, Account, Term } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

interface Checklist { placeholders: unknown[]; missingContact: string[]; newApplications: number; newMessages: number }

export default function Overview() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const students = useFetch<Paged<StudentRow>>('/students?pageSize=1');
  const teachers = useFetch<Paged<Account>>('/users?role=teacher&pageSize=1');
  const web = useFetch<Checklist>('/admin/site/checklist');
  const current = sessions.data?.find((s) => s.isCurrent);
  const terms = useFetch<Term[]>(current ? `/academic/terms?sessionId=${current.id}` : null);
  const term = terms.data?.find((t) => t.isCurrent);

  return (
    <>
      <PageHeader title="Overview" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Current session">
          <DataState loading={sessions.loading} error={sessions.error}>
            {current ? (
              <>
                <p className="text-2xl font-semibold">{current.name}</p>
                <p className="text-muted">{term ? term.name : 'No current term set'}</p>
              </>
            ) : (
              <p className="text-muted">No session is current yet. <Link className="font-medium text-brand-700 underline" to="/admin/academic">Set one up</Link>.</p>
            )}
          </DataState>
        </Card>
        <Card title="Students">
          <DataState loading={students.loading} error={students.error}>
            <p className="text-2xl font-semibold">{students.data?.total ?? 0}</p>
            <Link className="text-sm font-medium text-brand-700 underline" to="/admin/students">View students</Link>
          </DataState>
        </Card>
        <Card title="Teachers">
          <DataState loading={teachers.loading} error={teachers.error}>
            <p className="text-2xl font-semibold">{teachers.data?.total ?? 0}</p>
            <Link className="text-sm font-medium text-brand-700 underline" to="/admin/accounts">View accounts</Link>
          </DataState>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card title="New applications">
          <DataState loading={web.loading} error={web.error}><p className="text-2xl font-semibold">{web.data?.newApplications ?? 0}</p><Link className="text-sm font-medium text-brand-700 underline" to="/admin/applications">View applications</Link></DataState>
        </Card>
        <Card title="New messages">
          <DataState loading={web.loading} error={web.error}><p className="text-2xl font-semibold">{web.data?.newMessages ?? 0}</p><Link className="text-sm font-medium text-brand-700 underline" to="/admin/messages">Read messages</Link></DataState>
        </Card>
        <Card title="Website">
          <DataState loading={web.loading} error={web.error}>
            {web.data?.placeholders.length ? <p><span className="text-2xl font-semibold">{web.data.placeholders.length}</span> <span className="text-muted">placeholders left to fill in</span></p> : <p className="text-brand-700">All text filled in</p>}
            <Link className="text-sm font-medium text-brand-700 underline" to="/admin/website">Edit website content</Link>
          </DataState>
        </Card>
      </div>
    </>
  );
}
