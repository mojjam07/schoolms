import { pool, query, withTransaction, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { SCHOOL } from '../../config/school';
import { audit } from '../../services/audit';
import { notifyUsers, parentsOfStudents, safely } from '../notifications/notifications.service';
import { TERM_NAMES } from '../fees/fees.service';
import { listComponents } from './components.service';
import { Band, getBands, gradeFor } from './grading.service';
import type { Role } from '../users/roles';

type Actor = { id: string; role: Role; ip?: string };
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const notFound = (w: string) => new AppError(404, `${w} not found`, 'NOT_FOUND');

async function termInfo(db: Queryable, termId: string) {
  const t = (await db.query('select t.id, t.session_id, t.term_number, s.name as session_name from terms t join academic_sessions s on s.id = t.session_id where t.id = $1', [termId])).rows[0];
  if (!t) throw notFound('Term');
  return { id: t.id as string, sessionId: t.session_id as string, name: TERM_NAMES[t.term_number - 1], sessionName: t.session_name as string };
}

// Teachers may only enter scores for the class and subject they are assigned to in that session. Administrators may enter any.
async function assertCanScore(actor: Actor, sessionId: string, classId: string, subjectId: string) {
  const offered = await query('select 1 from class_subjects where class_id = $1 and subject_id = $2', [classId, subjectId]);
  if (!offered.rowCount) throw new AppError(400, 'That class does not take that subject.', 'VALIDATION_ERROR');
  if (actor.role === 'admin') return;
  const a = await query('select 1 from teaching_assignments where teacher_id = $1 and class_id = $2 and subject_id = $3 and session_id = $4', [actor.id, classId, subjectId, sessionId]);
  if (!a.rowCount) throw new AppError(403, 'You are not assigned to teach this subject in this class.', 'FORBIDDEN');
}
const isPublished = async (db: Queryable, termId: string, classId: string) => !!(await db.query('select 1 from result_publications where term_id = $1 and class_id = $2', [termId, classId])).rowCount;

// ---------------- the mark sheet a teacher fills in ----------------
export async function getSheet(actor: Actor, termId: string, classId: string, subjectId: string) {
  const term = await termInfo(pool, termId);
  await assertCanScore(actor, term.sessionId, classId, subjectId);
  const components = await listComponents(term.sessionId);
  if (!components.length) throw new AppError(409, 'The administrator has not set up the assessment columns for this session yet.', 'NO_COMPONENTS');
  const students = (await query(
    `select u.id, u.first_name, u.last_name, sp.admission_number from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
      where e.class_id = $1 and e.session_id = $2 and e.status = 'active' order by u.last_name, u.first_name`, [classId, term.sessionId])).rows;
  const sc = (await query('select student_id, component_id, score from scores where term_id = $1 and subject_id = $2 and student_id = any($3::uuid[])', [termId, subjectId, students.map((s) => s.id)])).rows;
  const names = (await query(`select ${CLASS_NAME} as class_name, (select name from subjects where id = $2) as subject_name from classes c where c.id = $1`, [classId, subjectId])).rows[0];
  const bands = await getBands();
  const maxTotal = components.reduce((s, c) => s + c.maxScore, 0);
  const published = await isPublished(pool, termId, classId);
  return {
    term: { id: term.id, name: term.name, sessionName: term.sessionName }, classId, className: names.class_name, subjectId, subjectName: names.subject_name,
    components: components.map(({ id, name, kind, maxScore }) => ({ id, name, kind, maxScore })), maxTotal, published, locked: published && actor.role !== 'admin', bands,
    students: students.map((s) => {
      const mine: Record<string, number | null> = Object.fromEntries(components.map((c) => [c.id, null]));
      for (const r of sc.filter((x) => x.student_id === s.id)) mine[r.component_id] = Number(r.score);
      const complete = components.every((c) => mine[c.id] !== null);
      const total = complete ? r2(components.reduce((t, c) => t + (mine[c.id] as number), 0)) : null;
      const percent = total === null ? null : r2((total / maxTotal) * 100);
      return { studentId: s.id, name: `${s.first_name} ${s.last_name}`, admissionNumber: s.admission_number, scores: mine, total, percent, grade: percent === null ? null : gradeFor(bands, percent)?.grade ?? null };
    }),
  };
}

export async function saveSheet(actor: Actor, i: { termId: string; classId: string; subjectId: string; entries: { studentId: string; componentId: string; score: number | null }[] }) {
  const term = await termInfo(pool, i.termId);
  await assertCanScore(actor, term.sessionId, i.classId, i.subjectId);
  const published = await isPublished(pool, i.termId, i.classId);
  if (published && actor.role !== 'admin') throw new AppError(409, 'Results for this class are published, so scores are locked. Ask the administrator if something needs correcting.', 'LOCKED');
  const comps = new Map((await listComponents(term.sessionId)).map((c) => [c.id, c]));
  const enrolled = new Set((await query("select student_id from enrolments where class_id = $1 and session_id = $2 and status = 'active'", [i.classId, term.sessionId])).rows.map((r) => r.student_id));
  const problems: { field: string; message: string }[] = [];
  i.entries.forEach((e, n) => {
    const c = comps.get(e.componentId);
    if (!c) problems.push({ field: `entries.${n}.componentId`, message: 'Unknown assessment column' });
    else if (e.score !== null && (e.score < 0 || e.score > c.maxScore)) problems.push({ field: `entries.${n}.score`, message: `${c.name}: enter a score from 0 to ${c.maxScore}` });
    else if (e.score !== null && Math.abs(e.score * 100 - Math.round(e.score * 100)) > 1e-6) problems.push({ field: `entries.${n}.score`, message: 'Use at most 2 decimal places' });
    if (!enrolled.has(e.studentId)) problems.push({ field: `entries.${n}.studentId`, message: 'That student is not in this class' });
  });
  if (problems.length) throw new AppError(400, 'Some scores need checking. Nothing was saved.', 'VALIDATION_ERROR', problems.slice(0, 50));

  await withTransaction(async (c) => {
    const key = (s: string, k: string) => `${s}|${k}`;
    const old = new Map((await c.query('select student_id, component_id, score from scores where term_id = $1 and subject_id = $2 and student_id = any($3::uuid[])', [i.termId, i.subjectId, [...enrolled]])).rows.map((r) => [key(r.student_id, r.component_id), Number(r.score)]));
    const sets = i.entries.filter((e) => e.score !== null); const clears = i.entries.filter((e) => e.score === null);
    if (sets.length) await c.query(
      `insert into scores (student_id, subject_id, term_id, component_id, score, entered_by)
       select x.s, $1, $2, x.c, x.v, $3 from unnest($4::uuid[], $5::uuid[], $6::numeric[]) as x(s, c, v)
       on conflict (student_id, subject_id, term_id, component_id) do update set score = excluded.score, entered_by = excluded.entered_by, updated_at = now()`,
      [i.subjectId, i.termId, actor.id, sets.map((e) => e.studentId), sets.map((e) => e.componentId), sets.map((e) => e.score)]);
    if (clears.length) await c.query('delete from scores where subject_id = $1 and term_id = $2 and (student_id, component_id) in (select * from unnest($3::uuid[], $4::uuid[]))', [i.subjectId, i.termId, clears.map((e) => e.studentId), clears.map((e) => e.componentId)]);
    // Corrections to published results are written down with the old and new values.
    const changes = published ? i.entries.filter((e) => (old.get(key(e.studentId, e.componentId)) ?? null) !== e.score).map((e) => ({ studentId: e.studentId, componentId: e.componentId, from: old.get(key(e.studentId, e.componentId)) ?? null, to: e.score })) : undefined;
    await audit({ actorId: actor.id, action: published ? 'scores.corrected_after_publication' : 'scores.saved', entityType: 'term', entityId: i.termId, metadata: { classId: i.classId, subjectId: i.subjectId, entries: i.entries.length, ...(changes ? { changes } : {}) }, ip: actor.ip }, c);
  });
  return getSheet(actor, i.termId, i.classId, i.subjectId);
}

// ---------------- working out the results ----------------
export interface SubjectResult { subjectId: string; subjectName: string; scores: Record<string, number | null>; total: number | null; maxTotal: number; percent: number | null; grade: string | null; remark: string | null; position: number | null; classAverage: number | null; complete: boolean }

// Positions use standard competition ranking: equal scores share a place and the next place is skipped (1, 1, 3).
const rank = (values: number[], mine: number) => 1 + values.filter((v) => v > mine).length;

export async function computeClass(db: Queryable, termId: string, classId: string, bands: Band[]) {
  const term = await termInfo(db, termId);
  const components = await listComponents(term.sessionId);
  const maxTotal = components.reduce((s, c) => s + c.maxScore, 0);
  const students = (await db.query(
    `select u.id, u.first_name, u.last_name, sp.admission_number from enrolments e join users u on u.id = e.student_id left join student_profiles sp on sp.user_id = u.id
      where e.class_id = $1 and e.session_id = $2 and e.status in ('active', 'graduated') order by u.last_name, u.first_name`, [classId, term.sessionId])).rows;
  const ids = students.map((s) => s.id);
  const scoreRows = (await db.query('select student_id, subject_id, component_id, score from scores where term_id = $1 and student_id = any($2::uuid[])', [termId, ids])).rows;
  // A subject counts for this class and term once anyone has a score in it; a student missing scores in such a subject is "incomplete".
  const subjectIds = [...new Set(scoreRows.map((r) => r.subject_id as string))];
  const subjects = subjectIds.length ? (await db.query('select id, name::text as name from subjects where id = any($1::uuid[]) order by name', [subjectIds])).rows : [];

  const per = new Map<string, Map<string, SubjectResult>>();
  for (const s of students) {
    const m = new Map<string, SubjectResult>();
    for (const sub of subjects) {
      const scores: Record<string, number | null> = Object.fromEntries(components.map((c) => [c.id, null]));
      for (const r of scoreRows) if (r.student_id === s.id && r.subject_id === sub.id) scores[r.component_id] = Number(r.score);
      const complete = components.length > 0 && components.every((c) => scores[c.id] !== null);
      const total = complete ? r2(components.reduce((t, c) => t + (scores[c.id] as number), 0)) : null;
      const percent = total === null ? null : r2((total / maxTotal) * 100);
      const g = percent === null ? null : gradeFor(bands, percent);
      m.set(sub.id, { subjectId: sub.id, subjectName: sub.name, scores, total, maxTotal, percent, grade: g?.grade ?? null, remark: g?.remark ?? null, position: null, classAverage: null, complete });
    }
    per.set(s.id, m);
  }
  for (const sub of subjects) {
    const done = students.map((s) => per.get(s.id)!.get(sub.id)!).filter((x) => x.complete);
    const pcts = done.map((x) => x.percent as number);
    const avg = pcts.length ? r2(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    for (const x of done) { x.position = rank(pcts, x.percent as number); x.classAverage = avg; }
    for (const s of students) per.get(s.id)!.get(sub.id)!.classAverage = avg;
  }
  const rows = students.map((s) => {
    const list = subjects.map((sub) => per.get(s.id)!.get(sub.id)!);
    const incomplete = list.filter((x) => !x.complete).map((x) => x.subjectName);
    const ranked = list.length > 0 && incomplete.length === 0;
    const average = ranked ? r2(list.reduce((t, x) => t + (x.percent as number), 0) / list.length) : null;
    const g = average === null ? null : gradeFor(bands, average);
    return { studentId: s.id as string, name: `${s.first_name} ${s.last_name}`, admissionNumber: s.admission_number as string | null, subjects: list, incompleteSubjects: incomplete, ranked, average, grade: g?.grade ?? null, remark: g?.remark ?? null,
      totalMarks: ranked ? r2(list.reduce((t, x) => t + (x.total as number), 0)) : null, totalPossible: ranked ? maxTotal * list.length : null, position: null as number | null };
  });
  const avgs = rows.filter((r) => r.ranked).map((r) => r.average as number);
  for (const r of rows) if (r.ranked) r.position = rank(avgs, r.average as number);
  return { term, components: components.map(({ id, name, kind, maxScore }) => ({ id, name, kind, maxScore })), maxTotal, subjects: subjects.map((s) => ({ id: s.id as string, name: s.name as string })), students: rows, rankedCount: avgs.length };
}

export async function classResults(termId: string, classId: string) {
  return computeClass(pool, termId, classId, await getBands());
}

export async function status(termId: string) {
  const term = await termInfo(pool, termId);
  const classes = (await query(
    `select c.id, ${CLASS_NAME} as name from classes c where exists (select 1 from enrolments e where e.class_id = c.id and e.session_id = $1) order by c.stage desc, c.year, c.arm nulls first`, [term.sessionId])).rows;
  const bands = await getBands();
  const pubs = new Map((await query('select class_id, published_at from result_publications where term_id = $1', [termId])).rows.map((r) => [r.class_id, r.published_at]));
  const out = [];
  for (const c of classes) {
    const r = await computeClass(pool, termId, c.id, bands);
    out.push({ classId: c.id, className: c.name, students: r.students.length, subjectsWithScores: r.subjects.length, studentsComplete: r.rankedCount, studentsIncomplete: r.students.length - r.rankedCount, publishedAt: pubs.get(c.id) ?? null });
  }
  return { term: { id: term.id, name: term.name, sessionName: term.sessionName }, classes: out };
}

// ---------------- publishing ----------------
export async function publish(actor: Actor, i: { termId: string; classId: string; allowIncomplete: boolean }) {
  const term = await termInfo(pool, i.termId);
  if (await isPublished(pool, i.termId, i.classId)) throw new AppError(409, 'Results for this class and term are already published.', 'ALREADY_PUBLISHED');
  const bands = await getBands();
  if (!bands.length) throw new AppError(409, 'Set up the grading scale first.', 'NO_GRADING');
  const r = await computeClass(pool, i.termId, i.classId, bands);
  if (!r.subjects.length) throw new AppError(409, 'No scores have been entered for this class and term yet.', 'NO_RESULTS');
  const incomplete = r.students.filter((s) => !s.ranked);
  if (incomplete.length && !i.allowIncomplete) {
    throw new AppError(409, `${incomplete.length} student${incomplete.length === 1 ? ' has' : 's have'} missing scores. Publish anyway, or ask the teachers to finish first.`, 'INCOMPLETE', incomplete.map((s) => ({ field: s.name, message: `Missing: ${s.incompleteSubjects.join(', ')}` })));
  }
  await withTransaction(async (c) => {
    await c.query('insert into result_publications (term_id, class_id, published_by, grading) values ($1,$2,$3,$4)', [i.termId, i.classId, actor.id, JSON.stringify(bands)]);
    await audit({ actorId: actor.id, action: 'results.published', entityType: 'term', entityId: i.termId, metadata: { classId: i.classId, students: r.students.length, incomplete: incomplete.length }, ip: actor.ip }, c);
  });
  await safely('results published', async () => {
    const ids = r.students.map((s) => s.studentId);
    const base = { type: 'results_published', title: `Results published: ${term.name}, ${term.sessionName}`, entityType: 'term', entityId: i.termId };
    await notifyUsers(pool, ids, { ...base, body: 'Your report card is ready to view.', link: '/student/results', dedupeKey: `results:${i.termId}:${i.classId}:student` });
    await notifyUsers(pool, await parentsOfStudents(pool, ids), { ...base, body: "Your child's report card is ready to view.", link: '/parent/results', dedupeKey: `results:${i.termId}:${i.classId}:parent` });
  });
  return { published: true, studentsWithMissingScores: incomplete.length };
}

export async function unpublish(actor: Actor, termId: string, classId: string) {
  const { rowCount } = await query('delete from result_publications where term_id = $1 and class_id = $2', [termId, classId]);
  if (!rowCount) throw new AppError(409, 'These results are not published.', 'NOT_PUBLISHED');
  await audit({ actorId: actor.id, action: 'results.unpublished', entityType: 'term', entityId: termId, metadata: { classId }, ip: actor.ip });
  return { published: false };
}

export async function setRemark(actor: Actor, termId: string, studentId: string, remark: string) {
  await termInfo(pool, termId);
  const who = await query("select 1 from users where id = $1 and role = 'student'", [studentId]);
  if (!who.rowCount) throw notFound('Student');
  if (!remark.trim()) await query('delete from report_remarks where student_id = $1 and term_id = $2', [studentId, termId]);
  else await query(`insert into report_remarks (student_id, term_id, remark, updated_by) values ($1,$2,$3,$4) on conflict (student_id, term_id) do update set remark = excluded.remark, updated_by = excluded.updated_by, updated_at = now()`, [studentId, termId, remark.trim(), actor.id]);
  await audit({ actorId: actor.id, action: 'report_remark.set', entityType: 'student', entityId: studentId, metadata: { termId }, ip: actor.ip });
  return { saved: true };
}

// ---------------- report cards ----------------
export async function reportCard(studentId: string, termId: string, mode: 'published' | 'preview') {
  const term = await termInfo(pool, termId);
  const en = (await query(
    `select e.class_id, ${CLASS_NAME} as class_name from enrolments e join classes c on c.id = e.class_id where e.student_id = $1 and e.session_id = $2 and e.status in ('active', 'graduated')`, [studentId, term.sessionId])).rows[0];
  if (!en) throw notFound('Report card');
  const pub = (await query('select published_at, grading from result_publications where term_id = $1 and class_id = $2', [termId, en.class_id])).rows[0];
  if (!pub && mode === 'published') throw notFound('Report card'); // unpublished results stay private, and "not found" gives nothing away
  const bands: Band[] = pub ? pub.grading : await getBands(); // published cards keep the grading scale they were published with
  const res = await computeClass(pool, termId, en.class_id, bands);
  const me = res.students.find((s) => s.studentId === studentId);
  if (!me) throw notFound('Report card');
  const stu = (await query('select first_name, last_name from users where id = $1', [studentId])).rows[0];
  const remark = (await query('select remark from report_remarks where student_id = $1 and term_id = $2', [studentId, termId])).rows[0]?.remark ?? null;
  return {
    school: { name: SCHOOL.name, address: SCHOOL.address }, preview: !pub, publishedAt: pub?.published_at ?? null,
    student: { name: `${stu.first_name} ${stu.last_name}`, admissionNumber: me.admissionNumber }, className: en.class_name, termName: term.name, sessionName: term.sessionName,
    components: res.components, maxTotal: res.maxTotal,
    subjects: me.subjects.map((s) => ({ name: s.subjectName, scores: s.scores, total: s.total, percent: s.percent, grade: s.grade, remark: s.remark, position: s.position, classAverage: s.classAverage })),
    summary: { ranked: me.ranked, totalMarks: me.totalMarks, totalPossible: me.totalPossible, average: me.average, grade: me.grade, remark: me.remark, position: me.position, outOf: res.rankedCount, studentsInClass: res.students.length, missing: me.incompleteSubjects },
    remark, gradingScale: [...bands].sort((a, b) => b.minPercent - a.minPercent),
  };
}

export async function publishedTermsFor(studentId: string) {
  const { rows } = await query(
    `select t.id, t.term_number, s.name as session_name, rp.published_at from enrolments e join terms t on t.session_id = e.session_id
       join result_publications rp on rp.term_id = t.id and rp.class_id = e.class_id join academic_sessions s on s.id = e.session_id
      where e.student_id = $1 and e.status in ('active', 'graduated') order by t.start_date desc`, [studentId]);
  return rows.map((r) => ({ termId: r.id, termName: TERM_NAMES[r.term_number - 1], sessionName: r.session_name, publishedAt: r.published_at }));
}
