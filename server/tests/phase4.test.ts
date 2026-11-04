// API running on :4000, migrated DB (and .env present so the reminder job can reach the DB), an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase4.test.ts
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
const inHours = (h: number) => new Date(Date.now() + h * 36e5).toISOString();
const feed = async (t: string, q = '') => (await call('GET', `/notifications${q}`, t)).data;
const count = async (t: string) => (await call('GET', '/notifications/unread-count', t)).data.count as number;
const titles = async (t: string) => (await feed(t)).items.map((n: any) => n.title) as string[];

(async () => {
  const { sendDueSoonReminders } = await import('../src/modules/notifications/notifications.events');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'N' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 3, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 3, arm: tag })).data;
  const math = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  for (const c of [c1, c2]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [math.id] });
  const teacher = await newUser(A, 'teacher', { staffNumber: `NT-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `N1-${sfx}` });
  const s2 = await newUser(A, 'student', { admissionNumber: `N2-${sfx}` });
  const s3 = await newUser(A, 'student', { admissionNumber: `N3-${sfx}` });
  const p1 = await newUser(A, 'parent'); const p2 = await newUser(A, 'parent');
  for (const [s, c] of [[s1, c1], [s2, c1], [s3, c2]] as const) await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: math.id, teacherId: teacher.id });
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s1.id, relationship: 'mother', isPrimary: true });

  check('notifications need sign-in', (await call('GET', '/notifications')).status, 401);
  check('everyone starts with an empty inbox', [await count(s1.token), await count(p1.token), await count(teacher.token)], [0, 0, 0]);

  // ---- lesson notes ----
  const note = (await call('POST', '/lesson-notes', teacher.token, { classId: c1.id, subjectId: math.id, title: 'Fractions', body: 'x', status: 'draft' })).data;
  check('a draft note notifies nobody', await count(s1.token), 0);
  await call('PATCH', `/lesson-notes/${note.id}`, teacher.token, { status: 'published' });
  check('publishing a note notifies the class', [await count(s1.token), await count(s2.token)], [1, 1]);
  check('other class is not notified', await count(s3.token), 0);
  check('parents are not told about lesson notes', await count(p1.token), 0);
  const n1 = (await feed(s1.token)).items[0];
  check('note notice has the right content and link', [n1.title, n1.link, n1.read], ['New lesson note: Fractions', '/student/learning', false]);
  await call('PATCH', `/lesson-notes/${note.id}`, teacher.token, { status: 'archived' });
  await call('PATCH', `/lesson-notes/${note.id}`, teacher.token, { status: 'published' });
  check('unpublish and republish does not notify twice', await count(s1.token), 1);

  // ---- video lessons ----
  const vid = (await call('POST', '/video-lessons', teacher.token, { classId: c1.id, subjectId: math.id, title: 'Decimals', url: 'https://youtu.be/dQw4w9WgXcQ', status: 'published' })).data;
  check('publishing a video on create notifies the class', [await count(s1.token), await count(s3.token)], [2, 0]);
  check('video notice text', (await titles(s1.token))[0], 'New video lesson: Decimals');
  void vid;

  // ---- assignments ----
  const base = { classId: c1.id, subjectId: math.id, title: 'Homework 1', maxMarks: 20, dueAt: inHours(72) };
  const asg = (await call('POST', '/assignments', teacher.token, { ...base, status: 'draft' })).data;
  check('a draft assignment notifies nobody', [await count(s1.token), await count(p1.token)], [2, 0]);
  await call('PATCH', `/assignments/${asg.id}`, teacher.token, { status: 'published' });
  check('publishing notifies the class students', [await count(s1.token), await count(s2.token), await count(s3.token)], [3, 3, 0]);
  const a1 = (await feed(s1.token)).items[0];
  check('assignment notice links to the assignment', [a1.title, a1.link], ['New assignment: Homework 1', `/student/assignments/${asg.id}`]);
  check('the linked parent is told; an unrelated parent is not', [await count(p1.token), await count(p2.token)], [1, 0]);
  check('parent notice names the class', ((await feed(p1.token)).items[0].title as string).startsWith('New assignment for JSS 3'), true);
  await call('PATCH', `/assignments/${asg.id}`, teacher.token, { status: 'closed' });
  await call('PATCH', `/assignments/${asg.id}`, teacher.token, { status: 'published' });
  check('closing and reopening does not notify again', await count(s1.token), 3);

  // scheduled publication
  const sched = (await call('POST', '/assignments', teacher.token, { ...base, title: 'Scheduled', status: 'published', publishAt: inHours(24) })).data;
  check('a scheduled assignment is not announced early', [await count(s1.token), await count(p1.token)], [3, 1]);
  await call('PATCH', `/assignments/${sched.id}`, teacher.token, { publishAt: null });
  check('when it goes live, the notice appears', [await count(s1.token), (await titles(s1.token))[0]], [4, 'New assignment: Scheduled']);

  // ---- submitting and marking ----
  const sub = await call('POST', `/assignments/${asg.id}/submissions`, s1.token, { textResponse: 'My answer' });
  check('student gets a submission receipt', (await titles(s1.token))[0], 'Work received: Homework 1');
  check('receipt says on time', (await feed(s1.token)).items[0].body, 'Handed in on time.');
  check('teacher is not spammed by submissions', await count(teacher.token), 0);
  const subId = sub.data.confirmation.submissionId;
  await call('PUT', `/submissions/${subId}/grade`, teacher.token, { marks: 17.5, feedback: 'Good' });
  check('saving marks without returning notifies nobody', [await count(s1.token), await count(p1.token)], [5, 2]);
  await call('POST', `/submissions/${subId}/return`, teacher.token);
  const ret = (await feed(s1.token)).items[0];
  check('returning marks notifies the student', [ret.title, ret.body.startsWith('You scored 17.5 / 20')], ['Marks returned: Homework 1', true]);
  check('the linked parent is told, with the child named', ((await feed(p1.token)).items[0].title as string).includes("work was marked: Homework 1"), true);
  check('unrelated parent still has nothing', await count(p2.token), 0);
  const sub2 = await call('POST', `/assignments/${asg.id}/submissions`, s2.token, { textResponse: 'S2' });
  await call('PUT', `/submissions/${sub2.data.confirmation.submissionId}/grade`, teacher.token, { marks: 9, feedback: '' });
  await call('POST', `/assignments/${asg.id}/return-graded`, teacher.token);
  check('bulk return notifies each student', (await titles(s2.token)).includes('Marks returned: Homework 1'), true);

  // ---- due-soon reminders ----
  const soon = (await call('POST', '/assignments', teacher.token, { ...base, title: 'Due tomorrow', dueAt: inHours(5), status: 'published' })).data;
  const before1 = await count(s1.token), before2 = await count(s2.token);
  await call('POST', `/assignments/${soon.id}/submissions`, s2.token, { textResponse: 'done early' });
  const made = await sendDueSoonReminders();
  check('reminder job reaches only students who have not handed in', [made >= 1, await count(s1.token) - before1, (await titles(s1.token))[0]], [true, 1, 'Due soon: Due tomorrow']);
  check('student who already handed in gets no reminder', (await titles(s2.token)).includes('Due soon: Due tomorrow'), false);
  void before2;
  await sendDueSoonReminders();
  check('running the job again creates no duplicates', (await titles(s1.token)).filter((t) => t === 'Due soon: Due tomorrow').length, 1);
  check('other class gets no reminder', (await titles(s3.token)).length, 0);

  // ---- reading, marking read, privacy ----
  const all = await feed(s1.token);
  const unread = await count(s1.token);
  check('list reports the unread count and total', [all.unreadCount === unread, all.total >= unread], [true, true]);
  const one = all.items[0];
  const r = await call('POST', `/notifications/${one.id}/read`, s1.token);
  check('marking one as read lowers the count', r.data.unreadCount, unread - 1);
  check('marking again is harmless', (await call('POST', `/notifications/${one.id}/read`, s1.token)).status, 200);
  check("cannot touch someone else's notification", (await call('POST', `/notifications/${one.id}/read`, s2.token)).status, 404);
  check('unread filter excludes read items', (await feed(s1.token, '?unread=true')).items.every((n: any) => !n.read), true);
  check('inbox only ever holds the owner\'s notices', (await feed(s2.token)).items.some((n: any) => n.id === one.id), false);
  check('pagination', [(await feed(s1.token, '?pageSize=2&page=1')).items.length, (await feed(s1.token, '?pageSize=2&page=2')).items.length > 0], [2, true]);
  check('bad id -> 400', (await call('POST', '/notifications/not-a-uuid/read', s1.token)).status, 400);
  check('mark all read', [(await call('POST', '/notifications/read-all', s1.token)).data.unreadCount, await count(s1.token)], [0, 0]);
  check("read-all does not touch other people's", (await count(s2.token)) > 0, true);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
