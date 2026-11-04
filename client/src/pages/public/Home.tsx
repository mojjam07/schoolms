import { Link } from 'react-router-dom';
import { Loading, EventItem, PostCard } from './Shared';
import { Paragraphs } from '../../components/Paragraphs';
import type { SiteData } from '../../lib/types';
import { usePageTitle } from '../../lib/usePageTitle';
import { usePublic } from '../../lib/useFetch';

export default function Home() {
  usePageTitle('');
  const s = usePublic<SiteData>('/public/site');
  const d = s.data;
  if (!d) return <Loading loading={s.loading} error={s.error} />;
  const h = d.content.home;
  return (
    <>
      <section className="bg-brand-500 text-white">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl">{h.heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-100">{h.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/admissions/apply" className="rounded-lg bg-gold-400 px-6 py-3 font-semibold text-brand-900 hover:bg-gold-500">Apply for admission</Link>
            <Link to="/login" className="rounded-lg border border-white/70 px-6 py-3 font-semibold hover:bg-white/10">Student, teacher or parent sign in</Link>
          </div>
          <div className="mt-10 h-1.5 w-24 rounded-full bg-gold-400" />
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-12 px-5 py-12">
        {d.announcements.length > 0 && (
          <section aria-labelledby="ann-h"><h2 id="ann-h" className="mb-3 font-display text-2xl font-bold">Announcements</h2>
            <ul className="space-y-3">{d.announcements.map((a) => <li key={a.slug} className="rounded-xl border-l-4 border-gold-500 bg-gold-100 p-4"><p className="font-semibold">{a.title}</p>{a.summary && <p>{a.summary}</p>}</li>)}</ul>
          </section>
        )}
        <section><Paragraphs text={h.intro} className="max-w-3xl text-lg" /></section>
        {h.highlights.length > 0 && (
          <section aria-labelledby="hl-h"><h2 id="hl-h" className="mb-4 font-display text-2xl font-bold">Why families choose us</h2>
            <ul className="grid gap-4 sm:grid-cols-3">{h.highlights.map((x, i) => <li key={i} className="rounded-xl border border-line bg-white p-5"><h3 className="font-display text-lg font-bold">{x.title}</h3><p className="mt-2 text-muted">{x.text}</p></li>)}</ul>
          </section>
        )}
        <div className="grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="news-h"><div className="mb-3 flex items-baseline justify-between"><h2 id="news-h" className="font-display text-2xl font-bold">Latest news</h2><Link className="text-sm font-medium text-brand-700 underline" to="/news">All news</Link></div>
            {d.latestNews.length ? <ul className="space-y-4">{d.latestNews.map((p) => <PostCard key={p.slug} p={p} />)}</ul> : <p className="rounded-lg border border-dashed border-line p-4 text-muted">No news yet. Check back soon.</p>}
          </section>
          <section aria-labelledby="ev-h"><div className="mb-3 flex items-baseline justify-between"><h2 id="ev-h" className="font-display text-2xl font-bold">Upcoming events</h2><Link className="text-sm font-medium text-brand-700 underline" to="/news">All events</Link></div>
            {d.upcomingEvents.length ? <ul className="space-y-3">{d.upcomingEvents.map((e, i) => <EventItem key={i} e={e} />)}</ul> : <p className="rounded-lg border border-dashed border-line p-4 text-muted">No upcoming events have been announced.</p>}
          </section>
        </div>
        <section className="rounded-xl bg-brand-50 p-6"><h2 className="font-display text-2xl font-bold">Visit us</h2><address className="mt-2 not-italic">{d.school.address}</address><p className="mt-3"><Link className="font-medium text-brand-700 underline" to="/contact">See the map and contact details</Link></p></section>
      </div>
    </>
  );
}
