import { Block, Loading, Page } from './Shared';
import { Paragraphs } from '../../components/Paragraphs';
import type { SiteData } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import { usePublic } from '../../lib/useFetch';

export default function About() {
  usePageTitle('About us');
  const s = usePublic<SiteData>('/public/site');
  if (!s.data) return <Loading loading={s.loading} error={s.error} />;
  const a = s.data.content.about;
  return (
    <Page title="About us">
      <Block title="Who we are"><Paragraphs text={a.overview} /></Block>
      <div className="grid gap-8 md:grid-cols-2">
        <Block title="Our mission"><Paragraphs text={a.mission} /></Block>
        <Block title="Our vision"><Paragraphs text={a.vision} /></Block>
      </div>
      <Block title="Our educational philosophy"><Paragraphs text={a.philosophy} /></Block>
      {a.values.length > 0 && <Block title="Our values"><ul className="grid gap-4 sm:grid-cols-3">{a.values.map((v, i) => <li key={i} className="rounded-xl border border-line bg-white p-5"><h3 className="font-display text-lg font-bold">{v.title}</h3><p className="mt-2 text-muted">{v.text}</p></li>)}</ul></Block>}
      {a.leadership.length > 0 && <Block title="Leadership"><ul className="grid gap-4 sm:grid-cols-2">{a.leadership.map((l, i) => <li key={i} className="rounded-xl border border-line bg-white p-5"><p className="font-display text-lg font-bold">{l.name}</p><p className="text-sm font-medium text-brand-700">{l.role}</p><Paragraphs text={l.bio} className="mt-2 text-muted" /></li>)}</ul></Block>}
    </Page>
  );
}
