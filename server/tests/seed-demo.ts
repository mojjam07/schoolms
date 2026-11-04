// Builds a small demo school through the API (fresh DB, active admin): npx tsx tests/seed-demo.ts
const B = 'http://localhost:4000/api'; const PW = 'Sup3rSecret99';
async function call(m: string, p: string, t?: string, b?: unknown) {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const j: any = await r.json(); if (!r.ok) throw new Error(`${m} ${p}: ${JSON.stringify(j)}`); return j.data;
}
async function user(A: string, role: string, email: string, extra: object = {}) {
  const r = await call('POST', '/users', A, { email, role, firstName: role[0].toUpperCase() + role.slice(1), lastName: 'Demo', ...extra });
  await call('POST', '/auth/activate', undefined, { token: r.activationLink.split('token=')[1], password: PW }); return r.user.id as string;
}
(async () => {
  const A = (await call('POST', '/auth/login', undefined, { email: 'boss@example.com', password: PW })).accessToken;
  const s = await call('POST', '/academic/sessions', A, { name: '2026/2027', startDate: '2026-09-14', endDate: '2027-07-23' });
  await call('POST', `/academic/sessions/${s.id}/set-current`, A);
  const term = await call('POST', '/academic/terms', A, { sessionId: s.id, termNumber: 1, startDate: '2026-09-14', endDate: '2026-12-18' });
  await call('POST', `/academic/terms/${term.id}/set-current`, A);
  const c1 = await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: 'A' });
  const c2 = await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: 'A' });
  const m = await call('POST', '/academic/subjects', A, { name: 'Mathematics' });
  const e = await call('POST', '/academic/subjects', A, { name: 'English Language' });
  for (const c of [c1, c2]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [m.id, e.id] });
  const t = await user(A, 'teacher', 'teacher@demo.test', { staffNumber: 'STF-01' });
  const s1 = await user(A, 'student', 'student1@demo.test', { admissionNumber: 'KOK-001' });
  const s2 = await user(A, 'student', 'student2@demo.test', { admissionNumber: 'KOK-002' });
  const par = await user(A, 'parent', 'parent@demo.test');
  await call('POST', '/academic/enrolments', A, { studentId: s1, classId: c1.id, sessionId: s.id });
  await call('POST', '/parent-links', A, { parentId: par, studentId: s1, relationship: 'mother', isPrimary: true });
  await call('POST', '/academic/enrolments', A, { studentId: s2, classId: c2.id, sessionId: s.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: s.id, classId: c1.id, subjectId: m.id, teacherId: t });
  console.log('demo school ready');
})().catch((e) => { console.error(e); process.exit(1); });
