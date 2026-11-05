// API running on :4000 (fresh process), migrated DB, .env present, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase7b.test.ts
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
const day = (ago: number) => new Date(Date.now() - ago * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: day(60), endDate: day(-60) })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: day(40), endDate: day(-40) })).data;
  const tag = 'T' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const tA = await newUser(A, 'teacher', { staffNumber: `AA-${sfx}` }); const tB = await newUser(A, 'teacher', { staffNumber: `AB-${sfx}` }); const tC = await newUser(A, 'teacher', { staffNumber: `AC-${sfx}` });
  const st = [] as { id: string; token: string }[];
  for (let n = 1; n <= 5; n++) st.push(await newUser(A, 'student', { admissionNumber: `A${n}-${sfx}` }));
  const [s1, s2, s3, s4, s5] = st;
  for (const [s, c] of [[s1, c1], [s2, c1], [s3, c1], [s4, c1], [s5, c2]] as const) await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  const enr = (await call('GET', `/academic/enrolments?sessionId=${sess.id}`, A)).data as any[];
  await call('PATCH', `/academic/enrolments/${enr.find((e) => e.studentId === s4.id).id}/status`, A, { status: 'withdrawn' });
  const p1 = await newUser(A, 'parent'); const p2 = await newUser(A, 'parent');
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s1.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: p2.id, studentId: s2.id, relationship: 'father' });

  // ---- form teachers ----
  const setFT = (t: any, classId: string, teacherId: string | null) => call('PUT', '/attendance/form-teachers', t.token, { classId, sessionId: sess.id, teacherId });
  check('only the administrator assigns form teachers', [(await setFT(tA, c1.id, tA.id)).status, (await setFT(p1, c1.id, tA.id)).status], [403, 403]);
  check('a student cannot be a form teacher', (await setFT({ token: A }, c1.id, s1.id)).status, 400);
  await setFT({ token: A }, c1.id, tA.id); const ftList = (await setFT({ token: A }, c2.id, tB.id)).data as any[];
  check('each class has its own form teacher', ftList.filter((f) => f.classId === c1.id || f.classId === c2.id).map((f) => f.teacherId), [tA.id, tB.id]);
  check('a teacher sees the classes they are form teacher of', ((await call('GET', '/teachers/me/form-classes', tA.token)).data as any[]).map((c) => c.classId), [c1.id]);
  check('a teacher with no class sees none', (await call('GET', '/teachers/me/form-classes', tC.token)).data, []);

  // ---- who may take a register ----
  const reg = (t: any, classId: string, d: string) => call('GET', `/attendance/register?classId=${classId}&date=${d}`, t.token);
  const today = day(0);
  const r0 = await reg(tA, c1.id, today);
  check('the form teacher opens the register: 3 active students, nothing marked yet', [r0.status, r0.data.students.length, r0.data.taken, r0.data.students.every((s: any) => s.status === null)], [200, 3, false, true]);
  check("another class's form teacher cannot", (await reg(tB, c1.id, today)).status, 403);
  check('a teacher who is no form teacher cannot', (await reg(tC, c1.id, today)).status, 403);
  check('students and parents cannot', [(await reg(s1, c1.id, today)).status, (await reg(p1, c1.id, today)).status], [403, 403]);
  check('the administrator can open any register', (await reg({ token: A }, c2.id, today)).status, 200);
  check('a future date is refused', (await reg(tA, c1.id, day(-1))).status, 400);
  check('a date outside every term is refused', [(await reg({ token: A }, c1.id, day(200))).status, (await reg({ token: A }, c1.id, day(200))).error.code], [400, 'NO_TERM']);

  // ---- taking it ----
  const save = (t: any, classId: string, d: string, entries: [any, string][]) => call('PUT', '/attendance/register', t.token, { classId, date: d, entries: entries.map(([s, status]) => ({ studentId: s.id, status })) });
  check('the register must list every student', (await save(tA, c1.id, today, [[s1, 'present'], [s2, 'absent']])).status, 400);
  check('a student from another class is refused', (await save(tA, c1.id, today, [[s1, 'present'], [s2, 'present'], [s3, 'present'], [s5, 'present']])).status, 400);
  check('a withdrawn student is not on the roster', (await save(tA, c1.id, today, [[s1, 'present'], [s2, 'present'], [s3, 'present'], [s4, 'present']])).status, 400);
  check('duplicates refused', (await save(tA, c1.id, today, [[s1, 'present'], [s1, 'absent'], [s3, 'present']])).status, 400);
  check('an invalid status is refused', (await save(tA, c1.id, today, [[s1, 'present'], [s2, 'sick'], [s3, 'present']])).status, 400);
  check("another class's form teacher cannot save", (await save(tB, c1.id, today, [[s1, 'present'], [s2, 'present'], [s3, 'present']])).status, 403);
  const saved = await save(tA, c1.id, today, [[s1, 'present'], [s2, 'absent'], [s3, 'late']]);
  check('the register is saved and reads back', [saved.status, saved.data.taken, saved.data.students.map((s: any) => s.status)], [200, true, ['present', 'absent', 'late']]);
  const notes = async (u: any, text: string) => ((await call('GET', '/notifications', u.token)).data.items as any[]).filter((n) => n.title.includes(text)).length;
  check("the absent child's parent is told; a present child's parent is not", [await notes(p2, 'was marked absent'), await notes(p1, 'was marked')], [1, 0]);
  await save(tA, c1.id, today, [[s1, 'present'], [s2, 'absent'], [s3, 'late']]);
  check('saving the same register again does not notify twice', await notes(p2, 'was marked absent'), 1);
  await save(tA, c1.id, today, [[s1, 'absent'], [s2, 'present'], [s3, 'late']]);
  check('correcting it: the newly absent child\'s parent is told, and nobody is re-notified', [await notes(p1, 'was marked absent'), await notes(p2, 'was marked absent')], [1, 1]);

  // ---- the correction window ----
  check('a form teacher can take yesterday\'s register', (await save(tA, c1.id, day(1), [[s1, 'present'], [s2, 'absent'], [s3, 'present']])).status, 200);
  check('but not one older than a week', [(await save(tA, c1.id, day(10), [[s1, 'present'], [s2, 'present'], [s3, 'present']])).status, (await save(tA, c1.id, day(10), [[s1, 'present'], [s2, 'present'], [s3, 'present']])).error.code], [409, 'LOCKED']);
  check('the sheet says it is locked for the teacher', (await reg(tA, c1.id, day(10))).data.locked, true);
  check('the administrator can still record it', (await save({ token: A }, c1.id, day(10), [[s1, 'present'], [s2, 'present'], [s3, 'present']])).status, 200);
  await save(tA, c1.id, day(3), [[s1, 'late'], [s2, 'absent'], [s3, 'present']]);

  // ---- counts ----
  const cs = (await call('GET', `/attendance/class-summary?classId=${c1.id}&termId=${term.id}`, tA.token)).data;
  const row = (sid: string) => cs.students.find((s: any) => s.studentId === sid);
  check('times the school opened', cs.registersTaken, 4);
  check('student 1: absent, present, late, present', [row(s1.id).opened, row(s1.id).present, row(s1.id).late, row(s1.id).absent, row(s1.id).percentPresent], [4, 3, 1, 1, 75]);
  check('student 2: present, absent, absent, present', [row(s2.id).present, row(s2.id).absent, row(s2.id).percentPresent], [2, 2, 50]);
  check('late counts as present (they were in school)', [row(s3.id).late, row(s3.id).present, row(s3.id).percentPresent], [1, 4, 100]);
  check('the withdrawn student is not counted', cs.students.some((s: any) => s.studentId === s4.id), false);
  check("another class's form teacher cannot see this summary", (await call('GET', `/attendance/class-summary?classId=${c1.id}&termId=${term.id}`, tB.token)).status, 403);
  check('the administrator can', (await call('GET', `/attendance/class-summary?classId=${c1.id}&termId=${term.id}`, A)).status, 200);

  // ---- absence explanations ----
  const explain = (t: any, sid: string, d: string, reason: string) => call('POST', `/parents/me/children/${sid}/explanations`, t.token, { date: d, reason });
  check('a parent can explain their own child\'s absence', [(await explain(p2, s2.id, day(1), 'He had malaria and was at the clinic.')).status], [201]);
  check('...but not a day the child was present', (await explain(p2, s2.id, today, 'Was ill')).status, 400);
  check("...and not another family's child (same answer as no such child)", [(await explain(p2, s1.id, today, 'Was ill')).status, (await explain(p2, crypto.randomUUID(), today, 'Was ill')).status], [404, 404]);
  check('a reason is required', (await explain(p2, s2.id, day(3), '')).status, 400);
  const re = await explain(p2, s2.id, day(1), 'He had malaria and was at the clinic on Tuesday.');
  check('explaining again while still pending replaces the text', [re.status, ((await call('GET', '/attendance/explanations?status=pending', tA.token)).data as any[]).filter((e) => e.date === day(1))[0].reason], [201, 'He had malaria and was at the clinic on Tuesday.']);
  check('students and teachers cannot submit explanations', [(await explain(s2, s2.id, day(1), 'x y z')).status, (await explain(tA, s2.id, day(1), 'x y z')).status], [403, 403]);
  check('the form teacher was told', await notes(tA, 'Absence explanation for'), 1);
  const pend = (await call('GET', '/attendance/explanations?status=pending', tA.token)).data as any[];
  check('the form teacher sees the pending explanation', [pend.length, pend[0].attendance, pend[0].reason.startsWith('He had malaria')], [1, 'absent', true]);
  check("another class's form teacher sees none and cannot review it", [((await call('GET', '/attendance/explanations', tB.token)).data as any[]).length, (await call('PATCH', `/attendance/explanations/${pend[0].id}`, tB.token, { status: 'accepted' })).status], [0, 404]);
  check('parents and students cannot review', [(await call('PATCH', `/attendance/explanations/${pend[0].id}`, p2.token, { status: 'accepted' })).status, (await call('PATCH', `/attendance/explanations/${pend[0].id}`, s2.token, { status: 'accepted' })).status], [403, 403]);
  check('the form teacher accepts it with a note', (await call('PATCH', `/attendance/explanations/${pend[0].id}`, tA.token, { status: 'accepted', note: 'Get well soon.' })).data.status, 'accepted');
  check('the parent is told the outcome', await notes(p2, 'Absence explanation accepted'), 1);
  check('a reviewed explanation cannot be changed by the parent', (await explain(p2, s2.id, day(1), 'Actually something else')).status, 409);
  const sum2 = (await call('GET', `/parents/me/children/${s2.id}/attendance?termId=${term.id}`, p2.token)).data;
  check('an accepted explanation excuses that absence but the record stays', [sum2.summary.absent, sum2.summary.excused, sum2.summary.unexplainedAbsent, sum2.summary.present], [2, 1, 1, 2]);
  await explain(p2, s2.id, day(3), 'Family event.');
  const p3 = ((await call('GET', '/attendance/explanations?status=pending', A)).data as any[]).find((e) => e.date === day(3));
  await call('PATCH', `/attendance/explanations/${p3.id}`, A, { status: 'declined', note: 'Please bring a note from the clinic.' });
  const sum2b = (await call('GET', `/parents/me/children/${s2.id}/attendance?termId=${term.id}`, p2.token)).data;
  check('a declined explanation leaves the absence unexplained and shows the school\'s reply', [sum2b.summary.excused, sum2b.days.find((d: any) => d.date === day(3)).explanation.status, sum2b.days.find((d: any) => d.date === day(3)).explanation.reviewNote], [1, 'declined', 'Please bring a note from the clinic.']);
  check('the administrator sees every explanation', ((await call('GET', '/attendance/explanations', A)).data as any[]).length >= 2, true);

  // ---- what parents and students see ----
  const v1 = (await call('GET', `/parents/me/children/${s1.id}/attendance?termId=${term.id}`, p1.token)).data;
  check('a parent sees their child\'s counts and the days missed or late', [v1.summary.opened, v1.summary.present, v1.days.map((d: any) => [d.date, d.status])], [4, 3, [[today, 'absent'], [day(3), 'late']]]);
  check("a parent cannot see another family's child", [(await call('GET', `/parents/me/children/${s2.id}/attendance?termId=${term.id}`, p1.token)).status, (await call('GET', `/parents/me/children/${s1.id}/attendance?termId=${term.id}`, p2.token)).status], [404, 404]);
  const me = (await call('GET', `/students/me/attendance?termId=${term.id}`, s1.token)).data;
  check('a student sees their own record, read only, without explanation details', [me.summary.absent, me.days.length, 'explanation' in me.days[0]], [1, 2, false]);
  check('parents and teachers cannot use the student route', [(await call('GET', `/students/me/attendance?termId=${term.id}`, p1.token)).status, (await call('GET', `/students/me/attendance?termId=${term.id}`, tA.token)).status], [403, 403]);
  check('nobody can change a register as a parent or student', [(await save(p1, c1.id, today, [[s1, 'present'], [s2, 'present'], [s3, 'present']])).status, (await save(s1, c1.id, today, [[s1, 'present'], [s2, 'present'], [s3, 'present']])).status], [403, 403]);

  // ---- report card ----
  const card = (await call('GET', `/results/report-card?termId=${term.id}&studentId=${s1.id}`, A)).data;
  check('the report card carries the attendance figures', [card.attendance.opened, card.attendance.present, card.attendance.absent, card.attendance.percentPresent], [4, 3, 1, 75]);

  // ---- the administrator's daily overview ----
  const status = (await call('GET', `/attendance/status?date=${today}`, A)).data as any[];
  const s1c = status.find((c) => c.classId === c1.id), s2c = status.find((c) => c.classId === c2.id);
  check('which registers have been taken today, and the counts', [s1c.taken, s1c.present, s1c.late, s1c.absent, s1c.formTeacher.startsWith('teacher'), s2c.taken], [true, 1, 1, 1, true, false]);
  check('teachers cannot use the overview', (await call('GET', `/attendance/status?date=${today}`, tA.token)).status, 403);

  const acts = new Set((await query("select action from audit_logs where action in ('attendance.taken','attendance.corrected','form_teacher.set','absence_explanation.submitted','absence_explanation.accepted','absence_explanation.declined')")).rows.map((r: any) => r.action));
  check('registers, corrections, form teachers and explanations are all audited', ['attendance.taken', 'attendance.corrected', 'form_teacher.set', 'absence_explanation.submitted', 'absence_explanation.accepted', 'absence_explanation.declined'].every((a) => acts.has(a)), true);
  const corr = (await query("select metadata from audit_logs where action = 'attendance.corrected' and entity_id = $1 order by id desc limit 1", [c1.id])).rows[0].metadata;
  check('a correction records what changed', Array.isArray(corr.changes) && corr.changes.length > 0, true);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
