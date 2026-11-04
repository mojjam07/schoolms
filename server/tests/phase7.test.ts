// API running on :4000 (fresh process), migrated DB, .env present, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase7.test.ts
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
function check(name: string, got: unknown, want: unknown) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${okk ? 'PASS' : 'FAIL'}  ${name}${okk ? '' : `  (expected ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`); okk ? pass++ : fail++;
}
const PW = 'Sup3rSecret99';
async function newUser(adminT: string, role: string, extra: Record<string, string> = {}) {
  const email = `${role}.${sfx}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await call('POST', '/users', adminT, { email, role, firstName: role, lastName: sfx, ...extra });
  await call('POST', '/auth/activate', undefined, { token: r.data.activationLink.split('token=')[1], password: PW });
  const l = await call('POST', '/auth/login', undefined, { email, password: PW });
  return { id: r.data.user.id as string, token: l.data.accessToken as string };
}

(async () => {
  const { query } = await import('../src/db/pool');
  await query('delete from grade_bands'); // start with no scale, as a new school would
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const t1 = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: '2026-09-14', endDate: '2026-12-18' })).data;
  const t2 = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 2, startDate: '2027-01-11', endDate: '2027-04-02' })).data;
  const tag = 'R' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const maths = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  const english = (await call('POST', '/academic/subjects', A, { name: `English ${sfx}` })).data;
  const science = (await call('POST', '/academic/subjects', A, { name: `Science ${sfx}` })).data;
  await call('PUT', `/academic/classes/${c1.id}/subjects`, A, { subjectIds: [maths.id, english.id, science.id] });
  await call('PUT', `/academic/classes/${c2.id}/subjects`, A, { subjectIds: [maths.id] });
  const tA = await newUser(A, 'teacher', { staffNumber: `RA-${sfx}` }); const tB = await newUser(A, 'teacher', { staffNumber: `RB-${sfx}` }); const tC = await newUser(A, 'teacher', { staffNumber: `RC-${sfx}` });
  const st = [] as { id: string; token: string }[];
  for (let n = 1; n <= 5; n++) st.push(await newUser(A, 'student', { admissionNumber: `S${n}-${sfx}` }));
  const [s1, s2, s3, s4, s5] = st;
  for (const [s, c] of [[s1, c1], [s2, c1], [s3, c1], [s4, c1], [s5, c2]] as const) await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  const enr = (await call('GET', `/academic/enrolments?sessionId=${sess.id}`, A)).data as any[];
  await call('PATCH', `/academic/enrolments/${enr.find((e) => e.studentId === s4.id).id}/status`, A, { status: 'withdrawn' });
  const p1 = await newUser(A, 'parent'); const p2 = await newUser(A, 'parent');
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s1.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: p2.id, studentId: s2.id, relationship: 'father' });
  for (const [c, sub, t] of [[c1, maths, tA], [c1, english, tA], [c1, science, tB], [c2, maths, tC]] as const) await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c.id, subjectId: sub.id, teacherId: t.id });

  // ---- grading scale ----
  check('grading needs sign-in', (await call('GET', '/results/grading')).status, 401);
  check('a new school starts with no grading scale', (await call('GET', '/results/grading', A)).data.bands, []);
  check('students and parents cannot change grading', [(await call('PUT', '/results/grading', s1.token, { bands: [{ minPercent: 0, grade: 'A', remark: '' }] })).status, (await call('PUT', '/results/grading', p1.token, { bands: [{ minPercent: 0, grade: 'A', remark: '' }] })).status], [403, 403]);
  check('teachers cannot change grading either', (await call('PUT', '/results/grading', tA.token, { bands: [{ minPercent: 0, grade: 'A', remark: '' }] })).status, 403);
  check('a scale must start at 0%', (await call('PUT', '/results/grading', A, { bands: [{ minPercent: 40, grade: 'P', remark: '' }] })).status, 400);
  check('two bands cannot start at the same percentage', (await call('PUT', '/results/grading', A, { bands: [{ minPercent: 0, grade: 'F', remark: '' }, { minPercent: 0, grade: 'G', remark: '' }] })).status, 400);
  check('a band needs a grade', (await call('PUT', '/results/grading', A, { bands: [{ minPercent: 0, grade: '', remark: '' }] })).status, 400);
  check('over 100% refused', (await call('PUT', '/results/grading', A, { bands: [{ minPercent: 0, grade: 'F', remark: '' }, { minPercent: 101, grade: 'A', remark: '' }] })).status, 400);
  const tpl = (await call('POST', '/results/grading/template', A)).data.bands as any[];
  check('the WAEC-style template gives A1 to F9, highest first', [tpl.length, tpl[0], tpl[8]], [9, { minPercent: 75, grade: 'A1', remark: 'Excellent' }, { minPercent: 0, grade: 'F9', remark: 'Fail' }]);
  check('teachers can read the scale', (await call('GET', '/results/grading', tA.token)).data.bands.length, 9);

  // ---- assessment columns ----
  const sheetQ = (t: string, c: string, s: string) => `/results/sheet?termId=${t}&classId=${c}&subjectId=${s}`;
  check('a mark sheet cannot open until columns exist', [(await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).status, (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).error.code], [409, 'NO_COMPONENTS']);
  check('only the administrator sets up columns', [(await call('POST', '/results/components/template', tA.token, { sessionId: sess.id })).status, (await call('POST', '/results/components', tA.token, { sessionId: sess.id, name: 'X', kind: 'ca', maxScore: 10 })).status], [403, 403]);
  const comps = (await call('POST', '/results/components/template', A, { sessionId: sess.id })).data as any[];
  check('template: CA 1 (20), CA 2 (20), Exam (60)', comps.map((c) => [c.name, c.kind, c.maxScore]), [['CA 1', 'ca', 20], ['CA 2', 'ca', 20], ['Exam', 'exam', 60]]);
  check('the template cannot be applied twice', (await call('POST', '/results/components/template', A, { sessionId: sess.id })).status, 409);
  check('duplicate column names refused', (await call('POST', '/results/components', A, { sessionId: sess.id, name: 'CA 1', kind: 'ca', maxScore: 10 })).status, 409);
  const extra = (await call('POST', '/results/components', A, { sessionId: sess.id, name: 'Project', kind: 'ca', maxScore: 10 })).data;
  check('an unused column can be renamed and deleted', [(await call('PATCH', `/results/components/${extra.id}`, A, { name: 'Project work' })).data.name, (await call('DELETE', `/results/components/${extra.id}`, A)).status], ['Project work', 200]);
  const [ca1, ca2, exam] = comps;

  // ---- who may open and fill a mark sheet ----
  const open = async (t: any, term: string, cls: string, sub: string) => (await call('GET', sheetQ(term, cls, sub), t.token)).status;
  check('a teacher opens the sheet for a class and subject they teach', await open(tA, t1.id, c1.id, maths.id), 200);
  check('not the subject they do not teach', await open(tA, t1.id, c1.id, science.id), 403);
  check('not another class', await open(tA, t1.id, c2.id, maths.id), 403);
  check('a teacher with no assignment is turned away', await open(tC, t1.id, c1.id, maths.id), 403);
  check('students and parents cannot open sheets', [await open(s1, t1.id, c1.id, maths.id), await open(p1, t1.id, c1.id, maths.id)], [403, 403]);
  check('the administrator can open any sheet', await open({ token: A }, t1.id, c1.id, science.id), 200);
  const sheet0 = (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).data;
  check('the sheet lists active students only (the withdrawn one is left out)', [sheet0.students.length, sheet0.maxTotal, sheet0.components.length, sheet0.published, sheet0.locked], [3, 100, 3, false, false]);

  // ---- entering scores ----
  const put = (t: any, term: string, cls: string, sub: string, entries: any[]) => call('PUT', '/results/sheet', t.token, { termId: term, classId: cls, subjectId: sub, entries });
  const e = (s: any, c: any, score: number | null) => ({ studentId: s.id, componentId: c.id, score });
  const bad1 = await put(tA, t1.id, c1.id, maths.id, [e(s1, ca1, 21)]);
  check('a score above the column maximum is refused with a clear message', [bad1.status, bad1.error.details[0].message], [400, 'CA 1: enter a score from 0 to 20']);
  check('negative scores refused', (await put(tA, t1.id, c1.id, maths.id, [e(s1, ca1, -1)])).status, 400);
  check('more than two decimals refused', (await put(tA, t1.id, c1.id, maths.id, [e(s1, ca1, 10.123)])).status, 400);
  check('a student from another class refused', (await put(tA, t1.id, c1.id, maths.id, [e(s5, ca1, 10)])).status, 400);
  check('a withdrawn student refused', (await put(tA, t1.id, c1.id, maths.id, [e(s4, ca1, 10)])).status, 400);
  check('an unknown column refused', (await put(tA, t1.id, c1.id, maths.id, [{ studentId: s1.id, componentId: crypto.randomUUID(), score: 5 }])).status, 400);
  check('one bad score means nothing at all is saved', [(await put(tA, t1.id, c1.id, maths.id, [e(s1, ca1, 18), e(s2, ca1, 99)])).status, (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).data.students[0].scores[ca1.id]], [400, null]);
  check('a student cannot enter scores', (await put(s1, t1.id, c1.id, maths.id, [e(s1, ca1, 20)])).status, 403);
  check('a teacher cannot enter scores for a subject they do not teach', (await put(tA, t1.id, c1.id, science.id, [e(s1, ca1, 20)])).status, 403);

  const enter = async (t: any, sub: any, rows: [any, number | null, number | null, number | null][]) => put(t, t1.id, c1.id, sub.id, rows.flatMap(([s, a, b, c]) => [e(s, ca1, a), e(s, ca2, b), e(s, exam, c)]));
  check('Maths scores saved', (await enter(tA, maths, [[s1, 20, 20, 60], [s2, 15, 14, 40], [s3, 10, 10, 30]])).status, 200);
  check('English scores saved (one student has no exam score yet)', (await enter(tA, english, [[s1, 15, 14.5, 45], [s2, 20, 15, 40], [s3, 10, 10, null]])).status, 200);
  check('Science scores saved by the Science teacher', (await enter(tB, science, [[s1, 20, 20, 40], [s2, 20, 20, 40], [s3, 10, 10, 40]])).status, 200);
  const mSheet = (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).data;
  check('the sheet shows total, percentage and grade as scores go in', mSheet.students.map((s: any) => [s.total, s.percent, s.grade]), [[100, 100, 'A1'], [69, 69, 'B3'], [50, 50, 'C6']]);
  const eSheet = (await call('GET', sheetQ(t1.id, c1.id, english.id), tA.token)).data;
  check('boundaries: 74.5% is B2, exactly 75% is A1, and a missing score gives no total', eSheet.students.map((s: any) => [s.total, s.grade]), [[74.5, 'B2'], [75, 'A1'], [null, null]]);
  await put(tA, t1.id, c1.id, maths.id, [e(s3, exam, null)]);
  check('clearing a score removes it', (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).data.students[2].scores[exam.id], null);
  await put(tA, t1.id, c1.id, maths.id, [e(s3, exam, 30)]);
  check('a column with scores cannot be deleted or lowered below a score', [(await call('DELETE', `/results/components/${exam.id}`, A)).status, (await call('PATCH', `/results/components/${exam.id}`, A, { maxScore: 50 })).status], [409, 409]);

  // ---- results, grades, positions ----
  const cls = (await call('GET', `/results/class?termId=${t1.id}&classId=${c1.id}`, A)).data;
  const by = (sid: string) => cls.students.find((s: any) => s.studentId === sid);
  const sub = (sid: string, name: string) => by(sid).subjects.find((x: any) => x.subjectName === `${name} ${sfx}`);
  check('three subjects have scores; the withdrawn student is not counted', [cls.subjects.length, cls.students.length], [3, 3]);
  check('subject results and grades', [[sub(s1.id, 'Maths').percent, sub(s1.id, 'Maths').grade], [sub(s2.id, 'Maths').percent, sub(s2.id, 'Maths').grade], [sub(s3.id, 'Maths').percent, sub(s3.id, 'Maths').grade]], [[100, 'A1'], [69, 'B3'], [50, 'C6']]);
  check('subject positions in Maths', [sub(s1.id, 'Maths').position, sub(s2.id, 'Maths').position, sub(s3.id, 'Maths').position], [1, 2, 3]);
  check('subject positions in English leave out the incomplete student', [sub(s2.id, 'English').position, sub(s1.id, 'English').position, sub(s3.id, 'English').position], [1, 2, null]);
  check('equal scores share a position and the next place is skipped (1, 1, 3)', [sub(s1.id, 'Science').position, sub(s2.id, 'Science').position, sub(s3.id, 'Science').position], [1, 1, 3]);
  check('class averages', [sub(s1.id, 'Maths').classAverage, sub(s1.id, 'English').classAverage, sub(s1.id, 'Science').classAverage], [73, 74.75, 73.33]);
  check('overall average, grade and class position', [[by(s1.id).average, by(s1.id).grade, by(s1.id).position, by(s1.id).totalMarks, by(s1.id).totalPossible], [by(s2.id).average, by(s2.id).position]], [[84.83, 'A1', 1, 254.5, 300], [74.67, 2]]);
  check('a student with a missing score is not ranked, and the gap is named', [by(s3.id).ranked, by(s3.id).position, by(s3.id).incompleteSubjects, cls.rankedCount], [false, null, [`English ${sfx}`], 2]);
  const stat = (await call('GET', `/results/status?termId=${t1.id}`, A)).data.classes.find((c: any) => c.classId === c1.id);
  check('the status panel counts complete and incomplete students', [stat.students, stat.subjectsWithScores, stat.studentsComplete, stat.studentsIncomplete, stat.publishedAt], [3, 3, 2, 1, null]);

  // ---- nothing is visible before publication ----
  check('students see no report cards before publication', [(await call('GET', '/students/me/report-cards', s1.token)).data, (await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).status], [[], 404]);
  check('parents see none either', [(await call('GET', `/parents/me/children/${s1.id}/report-cards`, p1.token)).data, (await call('GET', `/parents/me/children/${s1.id}/report-cards/${t1.id}`, p1.token)).status], [[], 404]);
  check('only the administrator can preview an unpublished report card', [(await call('GET', `/results/report-card?termId=${t1.id}&studentId=${s1.id}`, A)).data.preview, (await call('GET', `/results/report-card?termId=${t1.id}&studentId=${s1.id}`, tA.token)).status, (await call('GET', `/results/report-card?termId=${t1.id}&studentId=${s1.id}`, s1.token)).status], [true, 403, 403]);

  // ---- publishing ----
  check('only the administrator can publish', [(await call('POST', '/results/publish', tA.token, { termId: t1.id, classId: c1.id })).status, (await call('POST', '/results/publish', p1.token, { termId: t1.id, classId: c1.id })).status], [403, 403]);
  check('a class with no scores cannot be published', (await call('POST', '/results/publish', A, { termId: t1.id, classId: c2.id })).error.code, 'NO_RESULTS');
  const inc = await call('POST', '/results/publish', A, { termId: t1.id, classId: c1.id });
  check('publishing with missing scores is stopped and names who and what', [inc.status, inc.error.code, inc.error.details[0].message], [409, 'INCOMPLETE', `Missing: English ${sfx}`]);
  check('...until the administrator chooses to publish anyway', (await call('POST', '/results/publish', A, { termId: t1.id, classId: c1.id, allowIncomplete: true })).data, { published: true, studentsWithMissingScores: 1 });
  check('publishing twice refused', (await call('POST', '/results/publish', A, { termId: t1.id, classId: c1.id, allowIncomplete: true })).error.code, 'ALREADY_PUBLISHED');

  // ---- report cards ----
  check('the student sees the published term', ((await call('GET', '/students/me/report-cards', s1.token)).data as any[]).map((t) => [t.termId, t.termName]), [[t1.id, 'First Term']]);
  const card = (await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).data;
  check('report card header', [card.school.name, card.student.name, card.student.admissionNumber, card.className, card.termName, card.sessionName, card.preview], ['Kingdom of Knowledge', `student ${sfx}`, `S1-${sfx}`, `JSS 1${tag}`, 'First Term', sess.name, false]);
  check('report card subjects with scores, totals, grades, positions', card.subjects.map((s: any) => [s.name.split(' ')[0], s.total, s.grade, s.position]), [['English', 74.5, 'B2', 2], ['Maths', 100, 'A1', 1], ['Science', 80, 'A1', 1]]);
  check('report card summary', [card.summary.average, card.summary.grade, card.summary.position, card.summary.outOf, card.summary.ranked, card.summary.totalMarks, card.summary.totalPossible], [84.83, 'A1', 1, 2, true, 254.5, 300]);
  check('the card shows the columns and the grading scale used', [card.components.map((c: any) => c.name), card.gradingScale.length], [['CA 1', 'CA 2', 'Exam'], 9]);
  check("a student's card holds nobody else's details", JSON.stringify(card).includes(`S2-${sfx}`) || JSON.stringify(card).includes(`S3-${sfx}`), false);
  const card3 = (await call('GET', `/students/me/report-cards/${t1.id}`, s3.token)).data;
  check('an unranked student sees the gap and no position', [card3.summary.ranked, card3.summary.position, card3.summary.missing, card3.subjects.find((s: any) => s.name.startsWith('English')).total], [false, null, [`English ${sfx}`], null]);
  check("a student cannot reach another class's results", (await call('GET', `/students/me/report-cards/${t1.id}`, s5.token)).status, 404);
  check('parents read their own child through the child route', [(await call('GET', `/parents/me/children/${s1.id}/report-cards/${t1.id}`, p1.token)).data.summary.average, ((await call('GET', `/parents/me/children/${s1.id}/report-cards`, p1.token)).data as any[]).length], [84.83, 1]);
  check("a parent cannot open another family's child", [(await call('GET', `/parents/me/children/${s2.id}/report-cards/${t1.id}`, p1.token)).status, (await call('GET', `/parents/me/children/${s1.id}/report-cards/${t1.id}`, p2.token)).status], [404, 404]);
  check('that is the same answer as for a child that does not exist', (await call('GET', `/parents/me/children/${crypto.randomUUID()}/report-cards`, p1.token)).status, 404);
  check('teachers and students cannot use the parent route', [(await call('GET', `/parents/me/children/${s1.id}/report-cards`, tA.token)).status, (await call('GET', `/parents/me/children/${s1.id}/report-cards`, s1.token)).status], [403, 403]);
  check('a different term has nothing yet', [(await call('GET', `/students/me/report-cards/${t2.id}`, s1.token)).status, (await call('GET', `/results/class?termId=${t2.id}&classId=${c1.id}`, A)).data.subjects.length], [404, 0]);
  const notes = async (u: any) => ((await call('GET', '/notifications', u.token)).data.items as any[]).filter((n) => n.title.startsWith('Results published')).length;
  check('students and parents in the class were told once; others were not', [await notes(s1), await notes(p1), await notes(p2), await notes(s5)], [1, 1, 1, 0]);

  // ---- locked after publication; corrections are recorded ----
  check('teachers can no longer change published scores', [(await put(tA, t1.id, c1.id, maths.id, [e(s2, ca1, 16)])).status, (await put(tA, t1.id, c1.id, maths.id, [e(s2, ca1, 16)])).error.code], [409, 'LOCKED']);
  check('the sheet says it is locked for the teacher', (await call('GET', sheetQ(t1.id, c1.id, maths.id), tA.token)).data.locked, true);
  const fix = await put({ token: A }, t1.id, c1.id, maths.id, [e(s2, ca1, 16)]);
  check('the administrator can correct a score', [fix.status, fix.data.locked], [200, false]);
  const card2 = (await call('GET', `/parents/me/children/${s2.id}/report-cards/${t1.id}`, p2.token)).data;
  check('the correction shows on the published report card (69 became 70, so B3 became B2)', card2.subjects.find((s: any) => s.name.startsWith('Maths')).grade, 'B2');
  const aud = (await query("select metadata from audit_logs where action = 'scores.corrected_after_publication' and entity_id = $1 order by id desc limit 1", [t1.id])).rows[0]?.metadata;
  check('the correction is audited with the old and new values', [aud?.changes?.[0]?.from, aud?.changes?.[0]?.to], [15, 16]);

  // ---- changing the scale later must not rewrite published cards ----
  await call('PUT', '/results/grading', A, { bands: [{ minPercent: 0, grade: 'F', remark: 'Below' }, { minPercent: 50, grade: 'P', remark: 'Pass' }] });
  check('published report cards keep the scale they were published with', (await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).data.subjects.map((s: any) => s.grade), ['B2', 'A1', 'A1']);
  check('while working results use the new scale', (await call('GET', `/results/class?termId=${t1.id}&classId=${c1.id}`, A)).data.students.find((s: any) => s.studentId === s1.id).subjects.map((s: any) => s.grade), ['P', 'P', 'P']);
  await call('POST', '/results/grading/template', A);

  // ---- remarks ----
  check('teachers cannot write report remarks', (await call('PUT', '/results/remarks', tA.token, { termId: t1.id, studentId: s1.id, remark: 'x' })).status, 403);
  check('remarks are limited in length', (await call('PUT', '/results/remarks', A, { termId: t1.id, studentId: s1.id, remark: 'x'.repeat(501) })).status, 400);
  await call('PUT', '/results/remarks', A, { termId: t1.id, studentId: s1.id, remark: 'A pleasing result. Keep it up.' });
  check('the remark appears on the card', (await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).data.remark, 'A pleasing result. Keep it up.');
  await call('PUT', '/results/remarks', A, { termId: t1.id, studentId: s1.id, remark: '' });
  check('and an empty remark clears it', (await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).data.remark, null);

  // ---- unpublishing ----
  check('only the administrator can unpublish', (await call('POST', '/results/unpublish', tA.token, { termId: t1.id, classId: c1.id })).status, 403);
  check('unpublish', (await call('POST', '/results/unpublish', A, { termId: t1.id, classId: c1.id })).data, { published: false });
  check('the report card disappears for students and parents', [(await call('GET', `/students/me/report-cards/${t1.id}`, s1.token)).status, (await call('GET', `/parents/me/children/${s1.id}/report-cards/${t1.id}`, p1.token)).status], [404, 404]);
  check('and teachers can edit scores again', (await put(tA, t1.id, c1.id, maths.id, [e(s2, ca1, 15)])).status, 200);
  await call('POST', '/results/publish', A, { termId: t1.id, classId: c1.id, allowIncomplete: true });
  check('publishing again does not notify twice', await notes(s1), 1);

  const acts = new Set((await query("select action from audit_logs where action in ('grading.set','scores.saved','results.published','results.unpublished','assessment_component.template')")).rows.map((r: any) => r.action));
  check('grading, scores, publishing and unpublishing are all in the audit log', ['grading.set', 'scores.saved', 'results.published', 'results.unpublished', 'assessment_component.template'].every((a) => acts.has(a)), true);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
