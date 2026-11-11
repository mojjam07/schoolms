import { useState } from 'react';
import { Link } from 'react-router-dom';
import ChildOverview, { type ChildData } from '../../components/ChildOverview';
import { DataState, Empty, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/useFetch';

interface Family { children: (ChildData & { studentId: string; name: string })[]; unreadNotifications: number; unreadMessages: number | null }

export default function ParentDashboard() {
  const d = useFetch<Family>('/dashboard/parent');
  const [pick, setPick] = useState<string | null>(null);
  const child = d.data?.children.find((c) => c.studentId === pick) ?? d.data?.children[0];
  return (
    <>
      <PageHeader title="Home" intro="How your children are doing." />
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              {d.data.unreadNotifications > 0 && <Link className="rounded-lg border border-line bg-brand-50 px-3 py-2 text-brand-700 underline" to="/parent/notifications">{d.data.unreadNotifications} unread notification{d.data.unreadNotifications === 1 ? '' : 's'}</Link>}
              {(d.data.unreadMessages ?? 0) > 0 && <Link className="rounded-lg border border-line bg-brand-50 px-3 py-2 text-brand-700 underline" to="/parent/messages">{d.data.unreadMessages} unread message{d.data.unreadMessages === 1 ? '' : 's'}</Link>}
            </div>
            {d.data.children.length === 0 ? <Empty>No children are linked to your account yet. Please contact the school office.</Empty> : (
              <>
                {d.data.children.length > 1 && (
                  <div role="tablist" aria-label="Choose a child" className="mb-4 flex flex-wrap gap-2">
                    {d.data.children.map((c) => (
                      <button key={c.studentId} role="tab" aria-selected={c.studentId === child?.studentId} onClick={() => setPick(c.studentId)}
                        className={`rounded-full border px-4 py-1.5 text-sm ${c.studentId === child?.studentId ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white'}`}>{c.name}</button>
                    ))}
                  </div>
                )}
                {child && <><h2 className="mb-1 text-lg font-semibold">{child.name}</h2><ChildOverview d={child} base="/parent" studentId={child.studentId} /></>}
              </>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
