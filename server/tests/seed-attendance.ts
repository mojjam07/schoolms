// Seeds a small school for the attendance browser walkthrough and prints the logins as JSON.
// API running on :4000 (fresh process), migrated DB, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/seed-attendance.ts > /tmp/att-seed.json
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
const PW = 'Sup3rSecret99';
async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.error)}`);
  return json.data;
}
async function newUser(adminT: string, role: string, extra: Record<string, string> = {}) {
  const email = `${role}.${sfx}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await call('POST', '/users', adminT, { email, role, firstName: extra.firstName ?? role, lastName: extra.lastName ?? sfx, ...extra });
  await call('POST', '/auth/activate', undefined, { token: r.activationLink.split('token=')[1], password: PW });
  const l = await call('POST', '/auth/login', undefined, { email, password: PW });
  return { id: r.user.id as string, email, token: l.accessToken as string };
}
const day = (ago: number) => new Date(Date.now() - ago * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

(async () => {
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).accessToken as string;
  const y = 2100 + Math.floor(Math.random() * 7000);
  const sess = await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: day(60), endDate: day(-60) });
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: day(40), endDate: day(-40) });
  await call('POST', `/academic/terms/${term.id}/set-current`, A).catch(() => {});
  const arm = 'W' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm });
  const c2 = await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm });
  const teacher = await newUser(A, 'teacher', { staffNumber: `W-${sfx}`, firstName: 'Ngozi', lastName: 'Form' });
  const other = await newUser(A, 'teacher', { staffNumber: `X-${sfx}`, firstName: 'Other', lastName: 'Teacher' });
  const kids = [] as { id: string; email: string; token: string }[];
  for (const [n, f] of [[1, 'Ada'], [2, 'Bola'], [3, 'Chidi'], [4, 'Dayo']] as const) kids.push(await newUser(A, 'student', { admissionNumber: `W${n}-${sfx}`, firstName: f, lastName: 'Pupil' }));
  const far = await newUser(A, 'student', { admissionNumber: `W9-${sfx}`, firstName: 'Zane', lastName: 'Other' });
  for (const k of kids) await call('POST', '/academic/enrolments', A, { studentId: k.id, classId: c1.id, sessionId: sess.id });
  await call('POST', '/academic/enrolments', A, { studentId: far.id, classId: c2.id, sessionId: sess.id });
  const parent = await newUser(A, 'parent', { firstName: 'Mama', lastName: 'Pupil' });
  await call('POST', '/parent-links', A, { parentId: parent.id, studentId: kids[1].id, relationship: 'mother' });
  await call('PUT', '/attendance/form-teachers', A, { classId: c1.id, sessionId: sess.id, teacherId: teacher.id });
  // three school days: Bola absent twice, Chidi late once, Ada always present
  for (const [ago, marks] of [[3, ['present', 'absent', 'late', 'present']], [2, ['present', 'absent', 'present', 'present']], [1, ['present', 'present', 'present', 'present']]] as const) {
    await call('PUT', '/attendance/register', A, { classId: c1.id, date: day(ago), entries: kids.map((k, i) => ({ studentId: k.id, status: marks[i] })) });
  }
  // the parent explains one of Bola's absences
  await call('POST', `/parents/me/children/${kids[1].id}/explanations`, parent.token, { date: day(3), reason: 'He had malaria and was at the clinic.' });
  console.log(JSON.stringify({ password: PW, adminEmail: process.env.ADMIN_EMAIL, teacher: teacher.email, other: other.email, parent: parent.email, bola: kids[1].email, ada: kids[0].email, class1: arm, termId: term.id, bolaId: kids[1].id, adaId: kids[0].id, today: day(0), absentDay: day(3), oldDay: day(20) }));
})().catch((e) => { console.error(e); process.exit(1); });
