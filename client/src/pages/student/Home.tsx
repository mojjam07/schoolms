import { Link } from 'react-router-dom';
import { Card, DataState, Empty, PageHeader } from '../../components/ui';
import type { MyClass } from '../../lib/types';
import { InvoiceStatus } from '../../components/FeeBits';
import { fmtDate, naira } from '../../lib/format';
import type { MyInvoiceSummary } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export default function StudentHome() {
  const c = useFetch<MyClass>('/students/me/class');
  const fees = useFetch<MyInvoiceSummary[]>('/students/me/invoices');
  return (
    <>
      <PageHeader title="My class" />
      <Card>
        <DataState loading={c.loading} error={c.error}>
          {c.data?.className ? (
            <>
              <p className="text-2xl font-semibold">{c.data.className}</p>
              <p className="text-muted">{c.data.sessionName} session</p>
              <h2 className="mt-6 font-display text-lg font-bold">Subjects</h2>
              {c.data.subjects.length ? (
                <div className="mt-2 flex flex-wrap gap-2">{c.data.subjects.map((s) => <span key={s.id} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-900">{s.name}</span>)}</div>
              ) : <p className="mt-2 text-muted">Your class has no subjects set up yet.</p>}
              <p className="mt-6 text-sm"><Link className="font-medium text-brand-700 underline" to="/student/learning">Go to your lessons</Link></p>
            </>
          ) : <Empty>You have not been placed in a class for this session yet. Please contact the school office.</Empty>}
        </DataState>
      </Card>
      {!!fees.data?.length && (
        <div className="mt-6"><Card title="School fees">
          <ul className="divide-y divide-line">
            {fees.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{i.sessionName} {i.termName}{i.dueDate ? <span className="text-sm text-muted"> · pay by {fmtDate(i.dueDate)}</span> : null}</span>
                <span className="text-right"><span className="mr-2 font-medium">{i.balanceKobo > 0 ? `${naira(i.balanceKobo)} to pay` : 'Paid'}</span><InvoiceStatus i={i} /></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">Your parent or guardian pays your fees. Ask them if you have questions.</p>
        </Card></div>
      )}
    </>
  );
}
