// Parent and staff messaging: who can write to whom, privacy, replies, read tracking, closing, reports, administrator oversight.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase10.test.ts   (API on :4000, fresh process)
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
  return { id: r.data.user.id as string, token: l.data.accessToken as string, email };
}
const day = (ahead: number) => new Date(Date.now() + ahead * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: day(-60), endDate: day(300) })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'M' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const maths = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  await call('PUT', `/academic/classes/${c1.id}/subjects`, A, { subjectIds: [maths.id] });
  await call('PUT', `/academic/classes/${c2.id}/subjects`, A, { subjectIds: [maths.id] });

  const tMaths = await newUser(A, 'teacher', { staffNumber: `TM-${sfx}` });   // teaches class 1
  const tForm = await newUser(A, 'teacher', { staffNumber: `TF-${sfx}` });    // form teacher of class 1
  const tOther = await newUser(A, 'teacher', { staffNumber: `TO-${sfx}` });   // teaches class 2 only
  const stu = await newUser(A, 'student', { admissionNumber: `MS-${sfx}` });
  const stu2 = await newUser(A, 'student', { admissionNumber: `MT-${sfx}` });
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent');
  await call('POST', '/academic/enrolments', A, { studentId: stu.id, classId: c1.id, sessionId: sess.id });
  await call('POST', '/academic/enrolments', A, { studentId: stu2.id, classId: c2.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: maths.id, teacherId: tMaths.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c2.id, subjectId: maths.id, teacherId: tOther.id });
  await query('insert into class_form_teachers (class_id, session_id, teacher_id) values ($1,$2,$3)', [c1.id, sess.id, tForm.id]);
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: par2.id, studentId: stu2.id, relationship: 'father' });

  // ---------- contacts ----------
  const pc = await call('GET', '/messages/contacts', par.token);
  check('a parent sees only the teachers of their own child (subject teacher and form teacher)', pc.data[0].teachers.map((t: any) => t.id).sort(), [tMaths.id, tForm.id].sort());
  check('contacts carry no email or phone for staff', JSON.stringify(pc.data).includes('@') || JSON.stringify(pc.data).includes('phone'), false);
  check('a teacher sees only parents of pupils they teach', (await call('GET', '/messages/contacts', tMaths.token)).data.map((c: any) => c.parentId), [par.id]);
  check('a student has no messaging', [(await call('GET', '/messages/contacts', stu.token)).status, (await call('GET', '/messages/threads', stu.token)).status], [403, 403]);
  check('signed-out requests are refused', (await call('GET', '/messages/threads')).status, 401);

  // ---------- starting threads ----------
  check('a parent cannot write to a teacher who does not teach their child', (await call('POST', '/messages/threads', par.token, { studentId: stu.id, recipientId: tOther.id, subject: 'Hi', body: 'Hello' })).status, 403);
  check('a parent cannot write about a child who is not theirs', (await call('POST', '/messages/threads', par.token, { studentId: stu2.id, recipientId: null, subject: 'Hi', body: 'Hello' })).status, 403);
  check('an empty message and an over-long message are refused', [
    (await call('POST', '/messages/threads', par.token, { studentId: stu.id, recipientId: tMaths.id, subject: 'Hi', body: '   ' })).status,
    (await call('POST', '/messages/threads', par.token, { studentId: stu.id, recipientId: tMaths.id, subject: 'Hi', body: 'x'.repeat(4001) })).status], [400, 400]);
  const th = await call('POST', '/messages/threads', par.token, { studentId: stu.id, recipientId: tMaths.id, subject: 'Homework', body: 'Please can you explain the task?' });
  check('a parent starts a conversation with a teacher of their child', th.status, 201);
  check('the teacher is notified', (await query("select count(*)::int n from notifications where user_id = $1 and type = 'message' and entity_id = $2", [tMaths.id, th.data.id])).rows[0].n, 1);
  check('the teacher sees it in their inbox, unread', (await call('GET', '/messages/threads', tMaths.token)).data.items.map((t: any) => [t.id, t.unread]), [[th.data.id, true]]);
  check('the sender’s own message is not unread to them', (await call('GET', '/messages/threads', par.token)).data.items[0].unread, false);

  // ---------- privacy between people ----------
  check('another teacher, another parent and a student cannot open the thread (404, not 403)', [
    (await call('GET', `/messages/threads/${th.data.id}`, tOther.token)).status, (await call('GET', `/messages/threads/${th.data.id}`, par2.token)).status,
    (await call('GET', `/messages/threads/${th.data.id}`, stu.token)).status], [404, 404, 403]);
  check('another teacher cannot reply', (await call('POST', `/messages/threads/${th.data.id}/messages`, tOther.token, { body: 'hi' })).status, 404);
  check('the form teacher who is not on the thread cannot read it either', (await call('GET', `/messages/threads/${th.data.id}`, tForm.token)).status, 404);

  // ---------- replies and read tracking ----------
  const open = await call('GET', `/messages/threads/${th.data.id}`, tMaths.token);
  check('opening the thread shows the message and no staff contact details', [open.data.messages.length, open.data.messages[0].mine, JSON.stringify(open.data).includes('@')], [1, false, false]);
  check('opening marks it read for the teacher', (await call('GET', '/messages/unread-count', tMaths.token)).data.unread, 0);
  const rp = await call('POST', `/messages/threads/${th.data.id}/messages`, tMaths.token, { body: 'Of course: page 12.' });
  check('the teacher replies', rp.status, 201);
  check('the parent has one unread conversation', (await call('GET', '/messages/unread-count', par.token)).data.unread, 1);
  const pv = await call('GET', `/messages/threads/${th.data.id}`, par.token);
  check('the parent reads both messages in order and the count clears', [pv.data.messages.map((m: any) => m.mine), (await call('GET', '/messages/unread-count', par.token)).data.unread], [[true, false], 0]);

  // ---------- office threads ----------
  const off = await call('POST', '/messages/threads', par.token, { studentId: stu.id, recipientId: null, subject: 'Fees question', body: 'When is the deadline?' });
  check('a parent writes to the school office; every administrator is notified', [off.status, (await query("select count(*)::int n from notifications where entity_id = $1 and user_id = (select id from users where role = 'admin' limit 1)", [off.data.id])).rows[0].n], [201, 1]);
  check('the office thread is in the administrator’s inbox but not in a teacher’s', [
    (await call('GET', '/messages/threads', A)).data.items.some((t: any) => t.id === off.data.id), (await call('GET', '/messages/threads', tMaths.token)).data.items.some((t: any) => t.id === off.data.id)], [true, false]);
  check('an administrator replies to the office thread', (await call('POST', `/messages/threads/${off.data.id}/messages`, A, { body: 'Friday.' })).status, 201);

  // ---------- admin oversight ----------
  check('administrators can read a teacher’s thread but cannot reply to it', [(await call('GET', `/messages/threads/${th.data.id}`, A)).status, (await call('POST', `/messages/threads/${th.data.id}/messages`, A, { body: 'x' })).status], [200, 403]);
  check('that review is audited', (await query("select count(*)::int n from audit_logs where action = 'messages.thread_reviewed' and entity_id = $1", [th.data.id])).rows[0].n >= 1, true);
  check('only administrators can use the oversight list', [(await call('GET', '/messages/admin/threads', par.token)).status, (await call('GET', '/messages/admin/threads', A)).status], [403, 200]);

  // ---------- reporting and removing ----------
  const mid = pv.data.messages[1].id;
  check('a parent cannot report their own message', (await call('POST', `/messages/messages/${pv.data.messages[0].id}/report`, par.token, { reason: 'test reason' })).status, 400);
  check('a parent reports the teacher’s message', (await call('POST', `/messages/messages/${mid}/report`, par.token, { reason: 'Not appropriate' })).status, 200);
  check('someone outside the thread cannot report it', (await call('POST', `/messages/messages/${mid}/report`, par2.token, { reason: 'nosy' })).status, 404);
  check('the thread shows in the reported list', (await call('GET', '/messages/admin/threads?reported=true', A)).data.items.some((t: any) => t.id === th.data.id), true);
  check('the administrator removes the message; the parent sees a notice, not the text', [
    (await call('POST', `/messages/admin/messages/${mid}/hide`, A, { reason: 'Checked' })).status,
    (await call('GET', `/messages/threads/${th.data.id}`, par.token)).data.messages[1].body], [200, null]);
  check('the administrator can still read the removed text', typeof (await call('GET', `/messages/threads/${th.data.id}`, A)).data.messages[1].body, 'string');

  // ---------- closing ----------
  check('a parent cannot close a conversation', (await call('PATCH', `/messages/threads/${th.data.id}/status`, par.token, { status: 'closed' })).status, 403);
  check('the teacher closes it, and replies are then refused', [
    (await call('PATCH', `/messages/threads/${th.data.id}/status`, tMaths.token, { status: 'closed' })).status,
    (await call('POST', `/messages/threads/${th.data.id}/messages`, par.token, { body: 'One more' })).error?.code], [200, 'CLOSED']);
  check('reopening allows replies again', [(await call('PATCH', `/messages/threads/${th.data.id}/status`, tMaths.token, { status: 'open' })).status, (await call('POST', `/messages/threads/${th.data.id}/messages`, par.token, { body: 'Thanks' })).status], [200, 201]);

  // ---------- teacher starts, eligibility changes ----------
  check('a teacher writes to a parent of their pupil, but not to another class’s parent', [
    (await call('POST', '/messages/threads', tMaths.token, { studentId: stu.id, parentId: par.id, subject: 'Progress', body: 'Doing well.' })).status,
    (await call('POST', '/messages/threads', tMaths.token, { studentId: stu2.id, parentId: par2.id, subject: 'Progress', body: 'Hi' })).status], [201, 403]);
  await call('DELETE', `/parent-links/${par.id}/${stu.id}`, A);
  check('after the guardian link is removed the parent can no longer reply', (await call('POST', `/messages/threads/${th.data.id}/messages`, par.token, { body: 'Hello?' })).status, 403);
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu.id, relationship: 'mother' });

  // ---------- rate limit ----------
  let last = 201;
  for (let i = 0; i < 25 && last === 201; i++) last = (await call('POST', `/messages/threads/${th.data.id}/messages`, par.token, { body: `spam ${i}` })).status;
  check('a flood of messages is stopped', last, 429);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
