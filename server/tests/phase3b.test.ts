// API running on :4000, migrated DB, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase3b.test.ts
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function upload(token: string, name: string, bytes: Buffer, purpose?: string) {
  const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(bytes)]), name);
  const res = await fetch(B + '/files' + (purpose ? `?purpose=${purpose}` : ''), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const json: any = await res.json().catch(() => ({})); return { status: res.status, data: json.data };
}
async function download(token: string, id: string) {
  const res = await fetch(`${B}/files/${id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
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
const PDF = (tag: string) => Buffer.from(`%PDF-1.4\n${tag}\n%%EOF\n`);
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

(async () => {
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'B' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 2, arm: tag })).data;
  const math = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  const bio = (await call('POST', '/academic/subjects', A, { name: `Biology ${sfx}` })).data;
  for (const c of [c1, c2]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [math.id, bio.id] });
  const tA = await newUser(A, 'teacher', { staffNumber: `TA-${sfx}` });
  const tB = await newUser(A, 'teacher', { staffNumber: `TB-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `P1-${sfx}` });
  const s2 = await newUser(A, 'student', { admissionNumber: `P2-${sfx}` });
  const s3 = await newUser(A, 'student', { admissionNumber: `P3-${sfx}` });
  for (const [s, c] of [[s1, c1], [s2, c1], [s3, c2]] as const) await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: math.id, teacherId: tA.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: bio.id, teacherId: tB.id });

  // ---- uploads by purpose ----
  const attach = await upload(tA.token, 'worksheet.pdf', PDF('WORKSHEET'), 'assignment');
  check('teacher uploads an assignment attachment', attach.status, 201);
  check('student upload defaults to submission purpose', (await upload(s1.token, 'x.pdf', PDF('x'))).status, 201);
  check('student cannot upload as resource -> 403', (await upload(s1.token, 'x.pdf', PDF('x'), 'resource')).status, 403);
  check('teacher cannot upload as submission -> 403', (await upload(tA.token, 'x.pdf', PDF('x'), 'submission')).status, 403);

  // ---- create + validation ----
  const base = { classId: c1.id, subjectId: math.id, title: 'Algebra homework', description: 'Do questions 1 to 10', instructions: 'Show your working', maxMarks: 20, dueAt: inDays(7), fileIds: [attach.data.id] };
  check('maxMarks 0 -> 400', (await call('POST', '/assignments', tA.token, { ...base, maxMarks: 0, fileIds: [] })).status, 400);
  check('bad due date -> 400', (await call('POST', '/assignments', tA.token, { ...base, dueAt: 'tomorrow', fileIds: [] })).status, 400);
  check('not assigned to subject -> 403', (await call('POST', '/assignments', tA.token, { ...base, subjectId: bio.id, fileIds: [] })).status, 403);
  check("other teacher's file -> 400", (await call('POST', '/assignments', tB.token, { ...base, subjectId: bio.id })).status, 400);
  check('student cannot create -> 403', (await call('POST', '/assignments', s1.token, base)).status, 403);
  const a1 = await call('POST', '/assignments', tA.token, base);
  check('create draft (resubmission off by default)', [a1.status, a1.data.status, a1.data.allowResubmission, a1.data.maxMarks, a1.data.files.length], [201, 'draft', false, 20, 1]);
  const id = a1.data.id;

  // ---- visibility ----
  check('draft hidden from student list', (await call('GET', '/students/me/assignments', s1.token)).data.length, 0);
  check('draft not readable by student', (await call('GET', `/assignments/${id}`, s1.token)).status, 404);
  check('draft attachment not downloadable by student', (await download(s1.token, attach.data.id)).status, 404);
  await call('PATCH', `/assignments/${id}`, tA.token, { status: 'published', publishAt: inDays(1) });
  check('scheduled for tomorrow: still hidden', (await call('GET', '/students/me/assignments', s1.token)).data.length, 0);
  const pub = await call('PATCH', `/assignments/${id}`, tA.token, { publishAt: null });
  check('publish now; attachments survive a partial update', [pub.data.status, pub.data.files.length], ['published', 1]);
  const list1 = (await call('GET', '/students/me/assignments', s1.token)).data;
  check('class student sees it, not submitted', [list1.length, list1[0].myStatus, list1[0].overdue], [1, 'not_submitted', false]);
  check('student downloads assignment attachment', [(await download(s1.token, attach.data.id)).status], [200]);
  check('other class cannot list it', (await call('GET', '/students/me/assignments', s3.token)).data.length, 0);
  check('other class cannot read it', (await call('GET', `/assignments/${id}`, s3.token)).status, 404);
  check('other class cannot download attachment', (await download(s3.token, attach.data.id)).status, 404);
  check('other teacher cannot read it', (await call('GET', `/assignments/${id}`, tB.token)).status, 404);
  check('other teacher cannot edit it', (await call('PATCH', `/assignments/${id}`, tB.token, { title: 'x' })).status, 404);

  // ---- submitting ----
  check('empty submission -> 400', (await call('POST', `/assignments/${id}/submissions`, s1.token, { textResponse: '  ', fileIds: [] })).status, 400);
  check('other class cannot submit -> 404', (await call('POST', `/assignments/${id}/submissions`, s3.token, { textResponse: 'hi' })).status, 404);
  check('teacher cannot submit -> 403', (await call('POST', `/assignments/${id}/submissions`, tA.token, { textResponse: 'hi' })).status, 403);
  const work = await upload(s1.token, 'my work.pdf', PDF('S1-WORK'));
  const sub1 = await call('POST', `/assignments/${id}/submissions`, s1.token, { textResponse: 'Answers attached', fileIds: [work.data.id] });
  check('submit: confirmation, on time, attempt 1', [sub1.status, sub1.data.confirmation.attempt, sub1.data.confirmation.isLate, sub1.data.attempts.length], [201, 1, false, 1]);
  check('resubmit refused by default -> 409', (await call('POST', `/assignments/${id}/submissions`, s1.token, { textResponse: 'again' })).status, 409);
  check('second student submits separately', (await call('POST', `/assignments/${id}/submissions`, s2.token, { textResponse: 'S2 answer' })).status, 201);
  check("cannot attach someone else's submission file -> 400", (await call('POST', `/assignments/${id}/submissions`, s2.token, { textResponse: 'x', fileIds: [work.data.id] })).status, 400);

  // ---- who can see the work ----
  check('teacher downloads the student file', (await download(tA.token, work.data.id)).body.equals(PDF('S1-WORK')), true);
  check('classmate cannot download it', (await download(s2.token, work.data.id)).status, 404);
  check('other teacher cannot download it', (await download(tB.token, work.data.id)).status, 404);
  check('admin can download it', (await download(A, work.data.id)).status, 200);
  check('student cannot read the roster -> 403', (await call('GET', `/assignments/${id}/roster`, s1.token)).status, 403);
  check("student cannot read a classmate's submission -> 403", (await call('GET', `/assignments/${id}/students/${s2.id}/submission`, s1.token)).status, 403);
  check('other teacher cannot read the roster', (await call('GET', `/assignments/${id}/roster`, tB.token)).status, 404);
  const roster = (await call('GET', `/assignments/${id}/roster`, tA.token)).data as any[];
  check('roster lists the class', roster.map((r) => [r.name.split(' ')[0], r.status]).sort(), [['student', 'submitted'], ['student', 'submitted']]);
  const mine = (await call('GET', '/assignments', tA.token)).data[0];
  check('teacher list counts', [mine.enrolledCount, mine.submittedCount, mine.toMarkCount], [2, 2, 2]);

  // ---- marking ----
  const subId1 = sub1.data.confirmation.submissionId;
  check('marks above the maximum -> 400', (await call('PUT', `/submissions/${subId1}/grade`, tA.token, { marks: 21, feedback: '' })).status, 400);
  check('negative marks -> 400', (await call('PUT', `/submissions/${subId1}/grade`, tA.token, { marks: -1, feedback: '' })).status, 400);
  check('student cannot grade -> 403', (await call('PUT', `/submissions/${subId1}/grade`, s1.token, { marks: 20, feedback: '' })).status, 403);
  check('other teacher cannot grade -> 404', (await call('PUT', `/submissions/${subId1}/grade`, tB.token, { marks: 5, feedback: '' })).status, 404);
  check('grade saved (not returned)', (await call('PUT', `/submissions/${subId1}/grade`, tA.token, { marks: 17.5, feedback: 'Good, check Q4' })).status, 200);
  const hidden = (await call('GET', `/assignments/${id}/my-submission`, s1.token)).data.attempts[0];
  check('student sees no marks or feedback before return', [hidden.status, hidden.marks, hidden.feedback], ['submitted', null, null]);
  check('list also hides marks', (await call('GET', '/students/me/assignments', s1.token)).data[0].myMarks, null);
  check('teacher sees the marks', ((await call('GET', `/assignments/${id}/students/${s1.id}/submission`, tA.token)).data.attempts[0]).marks, 17.5);
  check('return to student', (await call('POST', `/submissions/${subId1}/return`, tA.token)).status, 200);
  const shown = (await call('GET', `/assignments/${id}/my-submission`, s1.token)).data.attempts[0];
  check('student now sees marks + feedback', [shown.status, shown.marks, shown.feedback], ['returned', 17.5, 'Good, check Q4']);
  check('returning twice -> 409', (await call('POST', `/submissions/${subId1}/return`, tA.token)).status, 409);
  check('cannot lower max marks below marks given -> 409', (await call('PATCH', `/assignments/${id}`, tA.token, { maxMarks: 10 })).status, 409);
  check('cannot move class after submissions -> 409', (await call('PATCH', `/assignments/${id}`, tA.token, { classId: c2.id })).status, 409);
  const sub2 = (await call('GET', `/assignments/${id}/roster`, tA.token)).data.find((r: any) => r.studentId === s2.id);
  await call('PUT', `/submissions/${sub2.submissionId}/grade`, tA.token, { marks: 12, feedback: 'ok' });
  check('return all graded', (await call('POST', `/assignments/${id}/return-graded`, tA.token)).data.returned, 1);

  // ---- closing ----
  await call('PATCH', `/assignments/${id}`, tA.token, { status: 'closed' });
  check('closed assignment refuses work -> 409', (await call('POST', `/assignments/${id}/submissions`, s2.token, { textResponse: 'late' })).status, 409);
  check('closed assignment stays visible with its feedback', (await call('GET', '/students/me/assignments', s1.token)).data[0].myMarks, 17.5);

  // ---- late work ----
  const late = (await call('POST', '/assignments', tA.token, { ...base, title: 'Late one', dueAt: inDays(-2), status: 'published', fileIds: [] })).data;
  check('overdue and not submitted flagged', (await call('GET', '/students/me/assignments', s2.token)).data.find((x: any) => x.id === late.id).overdue, true);
  const ls = await call('POST', `/assignments/${late.id}/submissions`, s2.token, { textResponse: 'sorry' });
  check('late submission accepted and marked late', [ls.status, ls.data.confirmation.isLate], [201, true]);
  check('teacher list shows the late count', (await call('GET', '/assignments', tA.token)).data.find((x: any) => x.id === late.id).lateCount, 1);

  // ---- resubmission allowed ----
  const rs = (await call('POST', '/assignments', tA.token, { ...base, title: 'Redo allowed', allowResubmission: true, status: 'published', fileIds: [] })).data;
  const f1 = await upload(s1.token, 'v1.pdf', PDF('V1')); const f2 = await upload(s1.token, 'v2.pdf', PDF('V2'));
  const r1 = await call('POST', `/assignments/${rs.id}/submissions`, s1.token, { textResponse: 'first try', fileIds: [f1.data.id] });
  const r1b = await call('POST', `/assignments/${rs.id}/submissions`, s1.token, { textResponse: 'better try', fileIds: [f2.data.id] });
  check('before marking, resubmitting replaces the attempt', [r1b.status, r1b.data.attempts.length, r1b.data.attempts[0].textResponse], [201, 1, 'better try']);
  check('the replaced file is gone for good', (await download(s1.token, f1.data.id)).status, 404);
  await call('PUT', `/submissions/${r1.data.confirmation.submissionId}/grade`, tA.token, { marks: 8, feedback: 'Needs work' });
  check('while being marked, resubmitting is refused -> 409', (await call('POST', `/assignments/${rs.id}/submissions`, s1.token, { textResponse: 'quick edit' })).status, 409);
  await call('POST', `/submissions/${r1.data.confirmation.submissionId}/return`, tA.token);
  const r2 = await call('POST', `/assignments/${rs.id}/submissions`, s1.token, { textResponse: 'after feedback' });
  check('after return, a new attempt is created', [r2.status, r2.data.attempts.length, r2.data.confirmation.attempt], [201, 2, 2]);
  check('earlier attempt keeps its marks', [r2.data.attempts[0].marks, r2.data.attempts[1].marks, r2.data.attempts[1].status], [8, null, 'submitted']);
  check('old attempt can no longer be graded -> 409', (await call('PUT', `/submissions/${r1.data.confirmation.submissionId}/grade`, tA.token, { marks: 9, feedback: '' })).status, 409);
  check('latest attempt can be graded', (await call('PUT', `/submissions/${r2.data.confirmation.submissionId}/grade`, tA.token, { marks: 15, feedback: 'Much better', returnToStudent: true })).status, 200);
  check('student sees both attempts with grades', (await call('GET', `/assignments/${rs.id}/my-submission`, s1.token)).data.attempts.map((a: any) => a.marks), [8, 15]);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
