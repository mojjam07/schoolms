import { Block, Loading, Page } from './Shared';
import { Paragraphs } from '../../components/Paragraphs';
import type { PubAcademics, SiteData } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import { usePublic } from '../../lib/useFetch';

const STAGE = { JSS: 'Junior Secondary School (JSS 1 to 3)', SSS: 'Senior Secondary School (SSS 1 to 3)' } as const;

export default function Academics() {
  usePageTitle('Academics');
  const s = usePublic<SiteData>('/public/site'); const ac = usePublic<PubAcademics>('/public/academics');
  if (!s.data) return <Loading loading={s.loading} error={s.error} />;
  const c = s.data.content.academics;
  return (
    <Page title="Academics" intro={c.intro}>
      <div className="grid gap-6 md:grid-cols-2">
        {ac.data?.stages.map((st) => (
          <section key={st.stage} className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">{STAGE[st.stage]}</h2>
            <ul className="mt-3 space-y-3">{st.levels.map((l) => (
              <li key={l.year}><p className="font-semibold">{l.name}</p>{l.subjects.length ? <p className="text-sm text-muted">{l.subjects.join(', ')}</p> : <p className="text-sm text-muted">Subjects will be listed here once the school sets them up.</p>}</li>
            ))}</ul>
          </section>
        ))}
      </div>
      <Block title="Curriculum"><Paragraphs text={c.curriculum} /></Block>
      <Block title="Academic programmes"><Paragraphs text={c.programmes} /></Block>
    </Page>
  );
}
