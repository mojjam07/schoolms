// Student and parent home pages: one overview per pupil, strictly scoped to the caller.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase13.test.ts   (API on :4000, fresh process)
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
const lagosDate = (ahead = 0) => new Date(Date.now() + ahead * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const lagosIsoDow = () => { const d = new Date().toLocaleDateString('en-US', { timeZone: 'Africa/Lagos', weekday: 'short' }); return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d) + 1; };

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const tch = await newUser(A, 'teacher', { staffNumber: `FT-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `F1-${sfx}` }); const s2 = await newUser(A, 'student', { admissionNumber: `F2-${sfx}` });
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent');

  check('roles are enforced', [(await call('GET', '/dashboard/student', par.token)).status, (await call('GET', '/dashboard/parent', s1.token)).status, (await call('GET', '/dashboard/student', tch.token)).status, (await call('GET', '/dashboard/parent')).status], [403, 403, 403, 401]);
  const empty = (await call('GET', '/dashboard/student', s1.token)).data;
  check('a student with no class yet gets an empty but valid overview', [empty.className, empty.lessonsToday.length, empty.fees], [null, 0, null]);

  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'F' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const sub = (await call('POST', '/academic/subjects', A, { name: `Fam ${sfx}` })).data;
  await call('PUT', `/academic/classes/${cls.id}/subjects`, A, { subjectIds: [sub.id] });
  await call('POST', '/academic/enrolments', A, { studentId: s1.id, classId: cls.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: cls.id, subjectId: sub.id, teacherId: tch.id });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: s1.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: s2.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: par2.id, studentId: s2.id, relationship: 'father' });

  const term = (await query('select id from terms where session_id = $1 and is_current', [sess.id])).rows[0];
  const dow = lagosIsoDow();
  if (dow <= 5) await query(`insert into timetable_entries (session_id, class_id, subject_id, day_of_week, start_time, end_time, room) values ($1,$2,$3,$4,'09:00','09:40','Room 1')`, [sess.id, cls.id, sub.id, dow]);
  const mk = async (title: string, due: string, status = 'published') => (await query(`insert into assignments (teacher_id, session_id, class_id, subject_id, title, max_marks, due_at, status) values ($1,$2,$3,$4,$5,20, now() + interval '${due}', $6) returning id`, [tch.id, sess.id, cls.id, sub.id, title, status])).rows[0].id;
  const aOpen = await mk('Open task', '2 days'); await mk('Missed task', '-2 days'); await mk('Draft task', '3 days', 'draft');
  const aDone = await mk('Marked task', '5 days');
  await query(`insert into submissions (assignment_id, student_id, text_response, status, marks, graded_at) values ($1,$2,'done','graded', 17, now())`, [aDone, s1.id]);
  if (term) {
    const sch = (await query(`insert into exam_schedules (term_id, title, is_published, published_at) values ($1,'Exams',true,now()) returning id`, [term.id])).rows[0].id;
    await query(`insert into exam_papers (schedule_id, class_id, subject_id, exam_date, start_time, end_time, venue) values ($1,$2,$3,$4,'10:00','11:00','Hall')`, [sch, cls.id, sub.id, lagosDate(3)]);
    const reg = (await query(`insert into attendance_registers (class_id, term_id, date) values ($1,$2,$3) returning id`, [cls.id, term.id, lagosDate(0)])).rows[0].id;
    await query(`insert into attendance_records (register_id, student_id, status) values ($1,$2,'present')`, [reg, s1.id]);
    await query(`insert into result_publications (term_id, class_id, grading) values ($1,$2,'{}')`, [term.id, cls.id]);
    const inv = (await query(`insert into invoices (student_id, term_id, class_id) values ($1,$2,$3) returning id`, [s1.id, term.id, cls.id])).rows[0].id;
    await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo) values ($1,'fee','Tuition', 5000000)`, [inv]);
    await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 2000000, 'cash')`, [inv]);
  }

  const st = (await call('GET', '/dashboard/student', s1.token)).data;
  check('the student sees their class', st.className, `JSS 1${tag}`);
  if (dow <= 5) check('today’s lesson shows with the teacher’s name', [st.lessonsToday.length, st.lessonsToday[0].subject, typeof st.lessonsToday[0].teacher], [1, `Fam ${sfx}`, 'string']);
  check('assignments due list only visible, future work, and counts the missed one', [st.assignments.due.map((a: any) => a.title).sort(), st.assignments.overdueCount], [['Marked task', 'Open task'], 1]);
  check('unsubmitted work comes before work already handed in', st.assignments.due[0].title, 'Open task');
  check('the marked task appears under recent marks', st.recentMarks.map((m: any) => [m.title, m.marks, m.maxMarks]), [['Marked task', 17, 20]]);
  check('a student never receives fee information', st.fees, null);
  if (term) {
    check('upcoming exam, attendance and latest result appear', [st.exams.length, st.attendance.percent, st.attendance.opened, !!st.latestResult], [1, 100, 1, true]);
  } else console.log('SKIP  exam, attendance, result and fee checks: the new session has no current term');
  check('a student without a class sees no one else’s data', (await call('GET', '/dashboard/student', s2.token)).data.assignments.due.length, 0);

  const p = (await call('GET', '/dashboard/parent', par.token)).data;
  check('the parent sees both linked children, with names', p.children.map((c: any) => c.studentId).sort(), [s1.id, s2.id].sort());
  const c1 = p.children.find((c: any) => c.studentId === s1.id);
  check('the parent sees the same overview for the enrolled child', [c1.className, c1.assignments.overdueCount], [`JSS 1${tag}`, 1]);
  if (term) check('the parent sees fees: total, paid and outstanding', [c1.fees.totalKobo, c1.fees.paidKobo, c1.fees.outstandingKobo], [5000000, 2000000, 3000000]);
  check('the second parent sees only their own child', (await call('GET', '/dashboard/parent', par2.token)).data.children.map((c: any) => c.studentId), [s2.id]);
  check('a parent with no linked child gets an empty list', (await call('GET', '/dashboard/parent', (await newUser(A, 'parent')).token)).data.children, []);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
