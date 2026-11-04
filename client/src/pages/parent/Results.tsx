import { Link, useParams } from 'react-router-dom';
import { Card, DataState, Empty, PageHeader } from '../../components/ui';
import { ReportCard } from '../../components/ReportCard';
import { fmtDateTime } from '../../lib/format';
import type { Child, PublishedTerm, ReportCardData } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

function ChildTerms({ c }: { c: Child }) {
  const list = useFetch<PublishedTerm[]>(`/parents/me/children/${c.id}/report-cards`);
  return (
    <Card title={`${c.firstName} ${c.lastName}`}>
      <DataState loading={list.loading} error={list.error}>
        {list.data?.length ? <ul className="divide-y divide-line">{list.data.map((t) => <li key={t.termId}><Link className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-brand-50" to={`/parent/results/${c.id}/${t.termId}`}><span className="font-medium">{t.sessionName} · {t.termName}</span><span className="text-sm text-muted">Published {fmtDateTime(t.publishedAt)}</span></Link></li>)}</ul>
          : <Empty>No report cards have been published for {c.firstName} yet.</Empty>}
      </DataState>
    </Card>
  );
}
export function ParentResults() {
  const kids = useFetch<Child[]>('/parents/me/children');
  return (
    <>
      <PageHeader title="Results" intro="Your children's report cards, once the school has published them." />
      <DataState loading={kids.loading} error={kids.error}>
        {kids.data?.length ? <div className="space-y-5">{kids.data.map((c) => <ChildTerms key={c.id} c={c} />)}</div> : <Card><Empty>No children are linked to your account yet.</Empty></Card>}
      </DataState>
    </>
  );
}
export function ParentReportCard() {
  const { studentId = '', termId = '' } = useParams();
  const card = useFetch<ReportCardData>(`/parents/me/children/${studentId}/report-cards/${termId}`);
  return (<><p className="no-print mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/parent/results">All results</Link></p><DataState loading={card.loading} error={card.error}>{card.data && <ReportCard d={card.data} />}</DataState></>);
}
