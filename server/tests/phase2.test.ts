// Run with the API up on :4000 against a migrated dev DB:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase2.test.ts
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
function check(name: string, got: unknown, want: unknown) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${okk ? 'PASS' : 'FAIL'}  ${name}${okk ? '' : `  (expected ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`);
  okk ? pass++ : fail++;
}
const PW = 'Sup3rSecret99';

async function newUser(adminT: string, role: string, extra: Record<string, string> = {}) {
  const email = `${role}.${sfx}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await call('POST', '/users', adminT, { email, role, firstName: role[0].toUpperCase() + role.slice(1), lastName: sfx, ...extra });
  if (r.status !== 201) throw new Error(`create ${role}: ${JSON.stringify(r)}`);
  const token = r.data.activationLink.split('token=')[1];
  await call('POST', '/auth/activate', undefined, { token, password: PW });
  const l = await call('POST', '/auth/login', undefined, { email, password: PW });
  return { id: r.data.user.id as string, token: l.data.accessToken as string };
}

(async () => {
  const a = await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const A = a.data.accessToken as string;

  // role-specific profile requirements
  check('student without admission number -> 400', (await call('POST', '/users', A, { email: `x${sfx}@example.com`, role: 'student', firstName: 'A', lastName: 'B' })).status, 400);
  check('teacher without staff number -> 400', (await call('POST', '/users', A, { email: `y${sfx}@example.com`, role: 'teacher', firstName: 'A', lastName: 'B' })).status, 400);

  const teacher = await newUser(A, 'teacher', { staffNumber: `T-${sfx}` });
  const student = await newUser(A, 'student', { admissionNumber: `S-${sfx}` });
  const student2 = await newUser(A, 'student', { admissionNumber: `S2-${sfx}` });
  const parent = await newUser(A, 'parent');
  const parent2 = await newUser(A, 'parent');
  check('duplicate admission number -> 409', (await call('POST', '/users', A, { email: `z${sfx}@example.com`, role: 'student', firstName: 'A', lastName: 'B', admissionNumber: `S-${sfx}` })).status, 409);

  // sessions
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sName = `${y}/${y + 1}`, s2Name = `${y + 1}/${y + 2}`;
  check('bad session name -> 400', (await call('POST', '/academic/sessions', A, { name: '2026-2027', startDate: '2026-09-01', endDate: '2027-07-30' })).status, 400);
  check('non-consecutive years -> 400', (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 2}`, startDate: '2026-09-01', endDate: '2027-07-30' })).status, 400);
  check('end before start -> 400', (await call('POST', '/academic/sessions', A, { name: sName, startDate: '2026-09-01', endDate: '2026-08-01' })).status, 400);
  const s1 = await call('POST', '/academic/sessions', A, { name: sName, startDate: '2026-09-01', endDate: '2027-07-30' });
  check('create session', s1.status, 201);
  check('dates are plain strings', s1.data.startDate, '2026-09-01');
  check('duplicate session -> 409', (await call('POST', '/academic/sessions', A, { name: sName, startDate: '2026-09-01', endDate: '2027-07-30' })).status, 409);
  const s2 = await call('POST', '/academic/sessions', A, { name: s2Name, startDate: '2027-09-01', endDate: '2028-07-30' });
  await call('POST', `/academic/sessions/${s1.data.id}/set-current`, A);
  await call('POST', `/academic/sessions/${s2.data.id}/set-current`, A);
  const list = (await call('GET', '/academic/sessions', student.token)).data as any[];
  check('student can read sessions', list.length >= 2, true);
  check('only one current session', list.filter((s) => s.isCurrent).map((s) => s.name), [s2Name]);
  check('student cannot create session -> 403', (await call('POST', '/academic/sessions', student.token, { name: '2200/2201', startDate: '2200-09-01', endDate: '2201-07-01' })).status, 403);

  // terms
  const t1 = await call('POST', '/academic/terms', A, { sessionId: s1.data.id, termNumber: 1, startDate: '2026-09-14', endDate: '2026-12-18' });
  check('create term', [t1.status, t1.data.name], [201, 'First Term']);
  check('duplicate term number -> 409', (await call('POST', '/academic/terms', A, { sessionId: s1.data.id, termNumber: 1, startDate: '2027-01-01', endDate: '2027-03-01' })).status, 409);
  check('term 4 -> 400', (await call('POST', '/academic/terms', A, { sessionId: s1.data.id, termNumber: 4, startDate: '2027-01-01', endDate: '2027-03-01' })).status, 400);
  await call('POST', `/academic/terms/${t1.data.id}/set-current`, A);
  const afterTerm = (await call('GET', '/academic/sessions', A)).data as any[];
  check('setting a term current switches the session too', afterTerm.filter((s) => s.isCurrent).map((s) => s.name), [sName]);
  await call('POST', `/academic/sessions/${s2.data.id}/set-current`, A);
  check('switching session clears the old current term', ((await call('GET', `/academic/terms?sessionId=${s1.data.id}`, A)).data as any[])[0].isCurrent, false);

  // classes and subjects
  const classes = (await call('GET', '/academic/classes', A)).data as any[];
  const armTag = 'T' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: armTag });
  check('create class with arm', [c1.status, c1.data.name], [201, `JSS 1${armTag}`]);
  check('duplicate class -> 409', (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: armTag })).status, 409);
  check('SSS 4 -> 400', (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 4 })).status, 400);
  const c2 = await call('POST', '/academic/classes', A, { stage: 'SSS', year: 2, arm: armTag });
  void classes;
  const m = await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` });
  const e = await call('POST', '/academic/subjects', A, { name: `English ${sfx}` });
  check('subject names are case-insensitive unique', (await call('POST', '/academic/subjects', A, { name: `MATHS ${sfx}` })).status, 409);

  check('set class subjects', ((await call('PUT', `/academic/classes/${c1.data.id}/subjects`, A, { subjectIds: [m.data.id, e.data.id] })).data as any[]).length, 2);

  // teaching assignments
  const ta = await call('POST', '/academic/teaching-assignments', A, { sessionId: s2.data.id, classId: c1.data.id, subjectId: m.data.id, teacherId: teacher.id });
  check('assign teacher', [ta.status, ta.data.subjectName], [201, `Maths ${sfx}`]);
  check('subject not offered by class -> 400', (await call('POST', '/academic/teaching-assignments', A, { sessionId: s2.data.id, classId: c2.data.id, subjectId: m.data.id, teacherId: teacher.id })).status, 400);
  check('non-teacher cannot be assigned -> 400', (await call('POST', '/academic/teaching-assignments', A, { sessionId: s2.data.id, classId: c1.data.id, subjectId: e.data.id, teacherId: student.id })).status, 400);
  check('cannot drop a subject that has a teacher -> 409', (await call('PUT', `/academic/classes/${c1.data.id}/subjects`, A, { subjectIds: [e.data.id] })).status, 409);
  check('teacher cannot manage assignments -> 403', (await call('POST', '/academic/teaching-assignments', teacher.token, { sessionId: s2.data.id, classId: c1.data.id, subjectId: e.data.id, teacherId: teacher.id })).status, 403);

  // enrolment
  check('enrol student', (await call('POST', '/academic/enrolments', A, { studentId: student.id, classId: c1.data.id, sessionId: s2.data.id })).status, 200);
  check('teacher cannot be enrolled -> 400', (await call('POST', '/academic/enrolments', A, { studentId: teacher.id, classId: c1.data.id, sessionId: s2.data.id })).status, 400);
  await call('POST', '/academic/enrolments', A, { studentId: student.id, classId: c2.data.id, sessionId: s2.data.id });
  const en = (await call('GET', `/academic/enrolments?sessionId=${s2.data.id}`, A)).data as any[];
  check('re-enrolling moves the student (one class per session)', en.filter((x) => x.studentId === student.id).map((x) => x.className), [`SSS 2${armTag}`]);
  await call('POST', '/academic/enrolments', A, { studentId: student.id, classId: c1.data.id, sessionId: s2.data.id });
  await call('POST', '/academic/enrolments', A, { studentId: student2.id, classId: c1.data.id, sessionId: s2.data.id });
  const dir = (await call('GET', `/students?classId=${c1.data.id}`, A)).data;
  check('student directory (current session, by class)', dir.total, 2);
  check('student directory search', ((await call('GET', `/students?q=S2-${sfx}`, A)).data.items as any[]).map((x) => x.admissionNumber), [`S2-${sfx}`]);
  check('student cannot see the directory -> 403', (await call('GET', '/students', student.token)).status, 403);

  // guardian links and object-level access
  check('student as parent -> 400', (await call('POST', '/parent-links', A, { parentId: student.id, studentId: student.id, relationship: 'guardian' })).status, 400);
  check('link parent to student', (await call('POST', '/parent-links', A, { parentId: parent.id, studentId: student.id, relationship: 'mother', isPrimary: true })).status, 201);
  check('parent sees own child + class', ((await call('GET', '/parents/me/children', parent.token)).data as any[]).map((c) => [c.id, c.className]), [[student.id, `JSS 1${armTag}`]]);
  check('other parent sees nothing', (await call('GET', '/parents/me/children', parent2.token)).data, []);
  check('parent cannot create links -> 403', (await call('POST', '/parent-links', parent.token, { parentId: parent.id, studentId: student2.id, relationship: 'mother' })).status, 403);
  check('parent cannot enrol -> 403', (await call('POST', '/academic/enrolments', parent.token, { studentId: student.id, classId: c1.data.id, sessionId: s2.data.id })).status, 403);
  check('teacher cannot use parent endpoint -> 403', (await call('GET', '/parents/me/children', teacher.token)).status, 403);
  check('teacher sees own current assignments', ((await call('GET', '/teachers/me/assignments', teacher.token)).data as any[]).map((x) => x.subjectName), [`Maths ${sfx}`]);
  const mine = (await call('GET', '/students/me/class', student.token)).data;
  check('student sees own class and subjects', [mine.className, mine.subjects.length], [`JSS 1${armTag}`, 2]);
  check('unlink', (await call('DELETE', `/parent-links/${parent.id}/${student.id}`, A)).status, 200);
  check('parent sees nothing after unlink', (await call('GET', '/parents/me/children', parent.token)).data, []);

  // cleanup assignment, then dropping the subject works
  check('remove assignment', (await call('DELETE', `/academic/teaching-assignments/${ta.data.id}`, A)).status, 200);
  check('now the subject can be dropped', ((await call('PUT', `/academic/classes/${c1.data.id}/subjects`, A, { subjectIds: [e.data.id] })).data as any[]).length, 1);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
