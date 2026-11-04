import { Link } from 'react-router-dom';
import { Block, Loading, Page } from './Shared';
import { Paragraphs } from '../../components/Paragraphs';
import type { SiteData } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import { usePublic } from '../../lib/useFetch';

export default function Admissions() {
  usePageTitle('Admissions');
  const s = usePublic<SiteData>('/public/site');
  if (!s.data) return <Loading loading={s.loading} error={s.error} />;
  const a = s.data.content.admissions;
  return (
    <Page title="Admissions" intro={a.openNote}>
      <Block title="How admission works"><Paragraphs text={a.intro} /></Block>
      <Block title="What you need"><ul className="list-disc space-y-1 pl-6">{a.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></Block>
      <Block title="After you apply"><Paragraphs text={a.process} /></Block>
      <div className="flex flex-wrap gap-3">
        <Link to="/admissions/apply" className="rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-600">Apply online</Link>
        <Link to="/admissions/status" className="rounded-lg border border-line px-6 py-3 font-semibold hover:bg-brand-50">Check an application</Link>
      </div>
    </Page>
  );
}
