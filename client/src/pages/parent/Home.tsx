import { Link } from 'react-router-dom';
import { Card, DataState, Empty, PageHeader } from '../../components/ui';
import type { Child } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export default function ParentHome() {
  const kids = useFetch<Child[]>('/parents/me/children');
  return (
    <>
      <PageHeader title="My children" intro="The children the school has linked to your account." />
      <DataState loading={kids.loading} error={kids.error}>
        {kids.data?.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {kids.data.map((c) => (
              <li key={c.id}><Card>
                <p className="text-lg font-semibold">{c.firstName} {c.lastName}</p>
                <p className="text-muted">{c.className ?? 'Not placed in a class this session'}</p>
                <p className="mt-1 text-sm text-muted capitalize">{c.relationship}{c.isPrimary ? ' · primary contact' : ''}{c.admissionNumber ? ` · ${c.admissionNumber}` : ''}</p>
              </Card></li>
            ))}
          </ul>
        ) : <Card><Empty>No children are linked to your account yet. Please contact the school office.</Empty></Card>}
      </DataState>
      <p className="mt-6 text-sm text-muted">Results, attendance and school fees will appear here as they are added. You will be notified when your child's work is marked: see <Link className="font-medium text-brand-700 underline" to="/parent/notifications">Notifications</Link>.</p>
    </>
  );
}
