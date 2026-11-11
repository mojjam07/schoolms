// Results history: progress across published terms and the yearly result, strictly limited to published terms and to the caller.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase14.test.ts   (API on :4000, fresh process)
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
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const stu = await newUser(A, 'student', { admissionNumber: `RH-${sfx}` }); const other = await newUser(A, 'student', { admissionNumber: `RO-${sfx}` });
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent'); const tch = await newUser(A, 'teacher', { staffNumber: `RT-${sfx}` });

  check('roles are enforced', [(await call('GET', '/results-history/me', par.token)).status, (await call('GET', '/results-history/children', stu.token)).status, (await call('GET', '/results-history/me', tch.token)).status, (await call('GET', '/results-history/me')).status], [403, 403, 403, 401]);
  check('a student with nothing published gets an empty history', (await call('GET', '/results-history/me', stu.token)).data, { terms: [], years: [] });

  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  let terms = (await query('select id, term_number from terms where session_id = $1 order by term_number', [sess.id])).rows;
  for (let n = terms.length + 1; n <= 3; n++) await query('insert into terms (session_id, term_number, start_date, end_date) values ($1,$2,$3,$4)', [sess.id, n, `2100-0${n * 3 - 2}-01`, `2100-0${n * 3 - 1}-28`]);
  terms = (await query('select id, term_number from terms where session_id = $1 order by term_number', [sess.id])).rows;
  const tag = 'R' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const maths = (await call('POST', '/academic/subjects', A, { name: `RMaths ${sfx}` })).data; const eng = (await call('POST', '/academic/subjects', A, { name: `REng ${sfx}` })).data;
  await call('PUT', `/academic/classes/${cls.id}/subjects`, A, { subjectIds: [maths.id, eng.id] });
  await call('POST', '/academic/enrolments', A, { studentId: stu.id, classId: cls.id, sessionId: sess.id });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu.id, relationship: 'mother' });
  const ca = (await query(`insert into assessment_components (session_id, name, kind, max_score, sort_order) values ($1,'CA','ca',40,1) returning id`, [sess.id])).rows[0].id;
  const ex = (await query(`insert into assessment_components (session_id, name, kind, max_score, sort_order) values ($1,'Exam','exam',60,2) returning id`, [sess.id])).rows[0].id;
  const put = (term: string, subj: string, comp: string, score: number) => query('insert into scores (student_id, subject_id, term_id, component_id, score) values ($1,$2,$3,$4,$5)', [stu.id, subj, term, comp, score]);
  const [t1, t2, t3] = terms.map((t: any) => t.id as string);
  // Term 1: Maths 30+50=80, English 20+20=40.  Term 2: Maths 20+30=50, English has CA only (incomplete).  Term 3: scores exist but are NOT published.
  await put(t1, maths.id, ca, 30); await put(t1, maths.id, ex, 50); await put(t1, eng.id, ca, 20); await put(t1, eng.id, ex, 20);
  await put(t2, maths.id, ca, 20); await put(t2, maths.id, ex, 30); await put(t2, eng.id, ca, 30);
  await put(t3, maths.id, ca, 40); await put(t3, maths.id, ex, 60); await put(t3, eng.id, ca, 40); await put(t3, eng.id, ex, 60);
  const bands = JSON.stringify([{ minPercent: 70, grade: 'A', remark: 'Excellent' }, { minPercent: 50, grade: 'C', remark: 'Credit' }, { minPercent: 0, grade: 'F', remark: 'Fail' }]);
  for (const t of [t1, t2]) await query('insert into result_publications (term_id, class_id, grading) values ($1,$2,$3::jsonb)', [t, cls.id, bands]);

  const h = (await call('GET', '/results-history/me', stu.token)).data;
  check('only the two published terms appear, oldest first', h.terms.map((t: any) => t.termNumber), [1, 2]);
  const m = (t: any, name: string) => t.subjects.find((s: any) => s.name === name);
  check('term 1: subject percentages and grades from the frozen scale', [m(h.terms[0], `RMaths ${sfx}`).percent, m(h.terms[0], `RMaths ${sfx}`).grade, m(h.terms[0], `REng ${sfx}`).percent, m(h.terms[0], `REng ${sfx}`).grade], [80, 'A', 40, 'F']);
  check('term 1 average is 60, grade C', [h.terms[0].average, h.terms[0].grade], [60, 'C']);
  check('term 2: the incomplete subject is flagged and left out of the average', [m(h.terms[1], `REng ${sfx}`).complete, h.terms[1].incompleteSubjects, h.terms[1].average], [false, [`REng ${sfx}`], 50]);
  check('the unpublished third term is never shown', JSON.stringify(h).includes('"termNumber":3'), false);

  const yr = h.years[0];
  check('yearly result: subject averages over complete published terms', [yr.subjects.find((s: any) => s.name === `RMaths ${sfx}`).percent, yr.subjects.find((s: any) => s.name === `REng ${sfx}`).percent, yr.subjects.find((s: any) => s.name === `REng ${sfx}`).termsCounted], [65, 40, 1]);
  check('yearly average 52.5, grade C, and marked provisional (2 of 3 terms)', [yr.average, yr.grade, yr.provisional, yr.termsPublished], [52.5, 'C', true, 2]);

  // The grades above come from the scale stored with each publication (A/C/F here), not from the school's live grade_bands table.

  check('another student sees none of it', (await call('GET', '/results-history/me', other.token)).data.terms.length, 0);
  const p = (await call('GET', '/results-history/children', par.token)).data;
  check('the linked parent sees the same history for the child', [p.length, p[0].studentId, p[0].terms.length, p[0].years[0].average], [1, stu.id, 2, 52.5]);
  check('an unlinked parent sees nothing', (await call('GET', '/results-history/children', par2.token)).data, []);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
