import { query } from '../../db/pool';
import { AppError } from '../../utils/AppError';

// Results history: how a pupil has done across terms, and a yearly result per session.
// Only terms whose results the school has PUBLISHED for the pupil's class are ever included, and each term is graded with the
// scale frozen at publication, exactly like the report card, so later changes to the grading scale never rewrite history.
interface Band { minPercent: number; grade: string; remark: string }
const bandsOf = (raw: any): Band[] => (Array.isArray(raw) ? raw : []).map((b: any) => ({ minPercent: Number(b.minPercent ?? b.min_percent ?? 0), grade: String(b.grade ?? ''), remark: String(b.remark ?? '') }))
  .sort((a, b) => b.minPercent - a.minPercent);
const gradeOf = (percent: number | null, bands: Band[]) => (percent === null ? null : bands.find((b) => percent >= b.minPercent) ?? null);
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function historyOf(studentId: string) {
  const { rows } = await query(
    `select sess.id as session_id, sess.name as session_name, sess.start_date, t.id as term_id, t.term_number, rp.published_at, rp.grading,
            c.stage || ' ' || c.year || coalesce(c.arm, '') as class_name,
            s.subject_id, sb.name as subject, sum(s.score)::float8 as total, count(*)::int as n,
            (select count(*)::int from assessment_components x where x.session_id = sess.id) as components,
            (select coalesce(sum(x.max_score), 0)::float8 from assessment_components x where x.session_id = sess.id) as max_total
       from result_publications rp
       join terms t on t.id = rp.term_id
       join academic_sessions sess on sess.id = t.session_id
       join enrolments e on e.class_id = rp.class_id and e.session_id = sess.id and e.student_id = $1
       join classes c on c.id = e.class_id
       join scores s on s.term_id = t.id and s.student_id = $1
       join assessment_components ac on ac.id = s.component_id and ac.session_id = sess.id
       join subjects sb on sb.id = s.subject_id
      group by sess.id, t.id, rp.term_id, rp.class_id, rp.published_at, rp.grading, c.id, s.subject_id, sb.name
      order by sess.start_date, t.term_number, sb.name`, [studentId]);

  // Group into terms.
  const terms = new Map<string, any>();
  for (const r of rows) {
    const t = terms.get(r.term_id) ?? { termId: r.term_id, termNumber: r.term_number, sessionId: r.session_id, sessionName: r.session_name, className: r.class_name, publishedAt: r.published_at, bands: bandsOf(r.grading), subjects: [] as any[] };
    const complete = r.components > 0 && r.n === r.components;
    const percent = complete && r.max_total > 0 ? (r.total / r.max_total) * 100 : null;
    t.subjects.push({ subjectId: r.subject_id, name: r.subject, total: complete ? r.total : null, percent, complete });
    terms.set(r.term_id, t);
  }
  const termList = [...terms.values()].map((t) => {
    const avg = mean(t.subjects.filter((s: any) => s.percent !== null).map((s: any) => s.percent));
    const g = gradeOf(avg, t.bands);
    return {
      termId: t.termId, termNumber: t.termNumber, sessionId: t.sessionId, sessionName: t.sessionName, className: t.className, publishedAt: t.publishedAt,
      average: avg === null ? null : round1(avg), grade: g?.grade ?? null, remark: g?.remark ?? null,
      subjects: t.subjects.map((s: any) => { const sg = gradeOf(s.percent, t.bands); return { subjectId: s.subjectId, name: s.name, percent: s.percent === null ? null : round1(s.percent), grade: sg?.grade ?? null, complete: s.complete }; }),
      incompleteSubjects: t.subjects.filter((s: any) => !s.complete).map((s: any) => s.name),
      _raw: t,
    };
  });

  // Yearly (cumulative) result per session: each subject's average over the published terms where it is complete.
  const sessions = new Map<string, any[]>();
  for (const t of termList) sessions.set(t.sessionId, [...(sessions.get(t.sessionId) ?? []), t]);
  const years = [...sessions.values()].map((ts) => {
    const subjects = new Map<string, { name: string; percents: number[] }>();
    for (const t of ts) for (const s of t._raw.subjects) {
      if (s.percent === null) continue;
      const cur = subjects.get(s.subjectId) ?? { name: s.name, percents: [] }; cur.percents.push(s.percent); subjects.set(s.subjectId, cur);
    }
    const bands: Band[] = ts[ts.length - 1]._raw.bands; // the scale of the latest published term in that session
    const subs = [...subjects.entries()].map(([id, v]) => { const p = mean(v.percents)!; return { subjectId: id, name: v.name, percent: round1(p), grade: gradeOf(p, bands)?.grade ?? null, termsCounted: v.percents.length, raw: p }; })
      .sort((a, b) => a.name.localeCompare(b.name));
    const avg = mean(subs.map((s) => s.raw));
    return {
      sessionId: ts[0].sessionId, sessionName: ts[0].sessionName, className: ts[ts.length - 1].className, termsPublished: ts.length,
      provisional: ts.length < 3, // fewer than three terms published so far: the yearly result is not final
      average: avg === null ? null : round1(avg), grade: avg === null ? null : gradeOf(avg, bands)?.grade ?? null,
      subjects: subs.map(({ raw, ...s }) => s),
    };
  });

  // A subject-by-term table for charts.
  return { terms: termList.map(({ _raw, ...t }) => t), years };
}

export async function assertParentOf(parentId: string, studentId: string) {
  const ok = (await query('select 1 from parent_students where parent_id = $1 and student_id = $2', [parentId, studentId])).rowCount;
  if (!ok) throw new AppError(404, 'Pupil not found', 'NOT_FOUND'); // never reveal that a pupil exists
}

export async function historyForParent(parentId: string) {
  const kids = (await query('select u.id, u.first_name, u.last_name from parent_students ps join users u on u.id = ps.student_id where ps.parent_id = $1 order by u.first_name', [parentId])).rows;
  return Promise.all(kids.map(async (k) => ({ studentId: k.id as string, name: `${k.first_name} ${k.last_name}`, ...(await historyOf(k.id)) })));
}
