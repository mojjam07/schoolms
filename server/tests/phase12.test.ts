// Dashboards: administrator overview and teacher home.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase12.test.ts   (API on :4000, fresh process)
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
  const tch = await newUser(A, 'teacher', { staffNumber: `DB-${sfx}` }); const tch2 = await newUser(A, 'teacher', { staffNumber: `DC-${sfx}` });
  const stu = await newUser(A, 'student', { admissionNumber: `DS-${sfx}` }); const par = await newUser(A, 'parent');

  check('roles are enforced', [(await call('GET', '/dashboard/admin', tch.token)).status, (await call('GET', '/dashboard/teacher', A)).status, (await call('GET', '/dashboard/admin', par.token)).status, (await call('GET', '/dashboard/teacher')).status], [403, 403, 403, 401]);

  const a0 = (await call('GET', '/dashboard/admin', A)).data;
  check('the administrator overview has every section', Object.keys(a0).sort(), ['announcements', 'applications', 'attention', 'fees', 'people', 'recentActions', 'studentsByClass', 'work']);
  check('people counts include the people just created', [a0.people.teachers >= 2, a0.people.students >= 1, a0.people.parents >= 1], [true, true, true]);

  // ---------- a teaching setup with one piece of work waiting to be marked ----------
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'D' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 3, arm: tag })).data;
  const sub = (await call('POST', '/academic/subjects', A, { name: `Dash ${sfx}` })).data;
  await call('PUT', `/academic/classes/${cls.id}/subjects`, A, { subjectIds: [sub.id] });
  await call('POST', '/academic/enrolments', A, { studentId: stu.id, classId: cls.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: cls.id, subjectId: sub.id, teacherId: tch.id });
  const asg = (await query(`insert into assignments (teacher_id, session_id, class_id, subject_id, title, max_marks, due_at, status) values ($1,$2,$3,$4,'Dashboard task', 20, now() + interval '3 days', 'published') returning id`, [tch.id, sess.id, cls.id, sub.id])).rows[0].id;
  await query(`insert into submissions (assignment_id, student_id, text_response, status) values ($1,$2,'my answer','submitted')`, [asg, stu.id]);

  const t = (await call('GET', '/dashboard/teacher', tch.token)).data;
  check('the teacher sees their class, one item to mark and one upcoming deadline', [t.classes, t.waitingTotal, t.toMark.map((x: any) => x.title), t.upcoming.map((x: any) => [x.title, x.handedIn, x.pupils])], [1, 1, ['Dashboard task'], [['Dashboard task', 1, 1]]]);
  const t2 = (await call('GET', '/dashboard/teacher', tch2.token)).data;
  check('another teacher sees none of it', [t2.classes, t2.waitingTotal, t2.toMark.length, t2.upcoming.length], [0, 0, 0, 0]);

  const a1 = (await call('GET', '/dashboard/admin', A)).data;
  check('the administrator sees the class, the open assignment and the submission waiting', [
    a1.studentsByClass.find((c: any) => c.classId === cls.id)?.students, a1.work.openAssignments >= 1, a1.work.awaitingMarking >= 1], [1, true, true]);

  // ---------- money: one invoice, part paid ----------
  const term = (await query('select id from terms where session_id = $1 and is_current', [sess.id])).rows[0];
  if (term) {
    const inv = (await query(`insert into invoices (student_id, term_id, class_id) values ($1,$2,$3) returning id`, [stu.id, term.id, cls.id])).rows[0].id;
    await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo) values ($1,'fee','Tuition', 10000000)`, [inv]);
    await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 4000000, 'cash')`, [inv]);
    const rev = (await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 1000000, 'cash') returning id`, [inv])).rows[0].id;
    await query('update payments set reversed_at = now() where id = $1', [rev]);
    const f = (await call('GET', '/dashboard/admin', A)).data.fees;
    check('tuition: billed, collected (reversed payments excluded) and outstanding', [f.billedKobo, f.collectedKobo, f.outstandingKobo, f.studentsOwing], [10000000, 4000000, 6000000, 1]);
  } else console.log('SKIP  tuition check: the new session has no current term (set one with your usual setup step and re-run)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
