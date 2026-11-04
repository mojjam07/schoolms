import { Link, useParams } from 'react-router-dom';
import { Card, DataState, Empty, PageHeader } from '../../components/ui';
import { ReportCard } from '../../components/ReportCard';
import { fmtDateTime } from '../../lib/format';
import type { PublishedTerm, ReportCardData } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export function StudentResults() {
  const list = useFetch<PublishedTerm[]>('/students/me/report-cards');
  return (
    <>
      <PageHeader title="My results" intro="Your report cards, once your school has published them." />
      <DataState loading={list.loading} error={list.error}>
        {list.data?.length ? <Card><ul className="divide-y divide-line">{list.data.map((t) => <li key={t.termId}><Link className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-brand-50" to={`/student/results/${t.termId}`}><span className="font-medium">{t.sessionName} · {t.termName}</span><span className="text-sm text-muted">Published {fmtDateTime(t.publishedAt)}</span></Link></li>)}</ul></Card>
          : <Card><Empty>No report cards have been published yet. You will get a notification when your results are ready.</Empty></Card>}
      </DataState>
    </>
  );
}
export function StudentReportCard() {
  const { termId = '' } = useParams();
  const card = useFetch<ReportCardData>(`/students/me/report-cards/${termId}`);
  return (<><p className="no-print mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/student/results">All report cards</Link></p><DataState loading={card.loading} error={card.error}>{card.data && <ReportCard d={card.data} />}</DataState></>);
}
