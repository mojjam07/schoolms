import { Link } from 'react-router-dom';
import { Card, DataState, Empty, PageHeader } from '../../components/ui';
import { InvoiceStatus } from '../../components/FeeBits';
import { fmtDate, naira } from '../../lib/format';
import type { InvoiceRow } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export default function ParentFees() {
  const list = useFetch<InvoiceRow[]>('/parents/me/invoices');
  const byChild = new Map<string, InvoiceRow[]>();
  list.data?.forEach((i) => byChild.set(i.studentName, [...(byChild.get(i.studentName) ?? []), i]));
  const owing = list.data?.filter((i) => i.balanceKobo > 0).reduce((s, i) => s + i.balanceKobo, 0) ?? 0;
  return (
    <>
      <PageHeader title="School fees" intro="Invoices, payments and receipts for your children." />
      <DataState loading={list.loading} error={list.error}>
        {list.data?.length ? (
          <div className="space-y-6">
            {owing > 0 && <p className="rounded-lg bg-gold-100 px-4 py-3 font-medium">Total outstanding: {naira(owing)}</p>}
            {[...byChild.entries()].map(([child, invs]) => (
              <Card key={child} title={child}>
                <ul className="divide-y divide-line">
                  {invs.map((i) => (
                    <li key={i.id}>
                      <Link to={`/parent/fees/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-brand-50">
                        <span><span className="block font-medium">{i.sessionName} {i.termName}</span><span className="block text-sm text-muted">{i.number}{i.dueDate ? ` · pay by ${fmtDate(i.dueDate)}` : ''}</span></span>
                        <span className="text-right"><span className="block font-semibold">{i.balanceKobo > 0 ? `${naira(i.balanceKobo)} to pay` : 'Nothing to pay'}</span><InvoiceStatus i={i} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : <Card><Empty>No invoices yet. When the school issues fees for your child, they will appear here.</Empty></Card>}
      </DataState>
    </>
  );
}
