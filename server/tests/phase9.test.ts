// People editing, CSV import, audit viewer, fee exports, parent assignments, applicant conversion.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase9.test.ts   (API on :4000, fresh process)
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;
async function call(method: string, path: string, token?: string, body?: unknown, raw = false) {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
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
  const { toCsv, parseCsv } = await import('../src/utils/csv');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: day(-60), endDate: day(300) })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: day(-40), endDate: day(60) })).data;
  const tag = 'U' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const maths = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  await call('PUT', `/academic/classes/${c1.id}/subjects`, A, { subjectIds: [maths.id] });

  // ---------- csv helpers ----------
  check('csv reader handles quotes, commas, CRLF and a BOM', parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  check('csv writer guards against spreadsheet formulas but keeps negative numbers', toCsv([['=1+1', '-5.00', 'ok', '@x']]), '\uFEFF\'=1+1,-5.00,ok,\'@x\r\n');

  // ---------- editing people ----------
  const t1 = await newUser(A, 'teacher', { staffNumber: `ST-${sfx}` }); const t2 = await newUser(A, 'teacher', { staffNumber: `SU-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `AD-${sfx}` }); const s2 = await newUser(A, 'student', { admissionNumber: `AE-${sfx}` });
  check('only the administrator can edit people', [(await call('PATCH', `/users/${s1.id}`, t1.token, { firstName: 'X' })).status, (await call('GET', `/users/${s1.id}`, s1.token)).status], [403, 403]);
  const ed = await call('PATCH', `/users/${s1.id}`, A, { firstName: 'Chidi', lastName: 'Eze', phone: '08011112222', dateOfBirth: '2012-03-04', admissionNumber: `AD2-${sfx}` });
  check('name, phone, date of birth and admission number change', [ed.status, ed.data.user.firstName, ed.data.user.phone, ed.data.user.dateOfBirth, ed.data.user.admissionNumber], [200, 'Chidi', '08011112222', '2012-03-04', `AD2-${sfx}`]);
  check('phone can be cleared', (await call('PATCH', `/users/${s1.id}`, A, { phone: null })).data.user.phone, null);
  check('an empty edit is refused', (await call('PATCH', `/users/${s1.id}`, A, {})).status, 400);
  check('a future date of birth is refused', (await call('PATCH', `/users/${s1.id}`, A, { dateOfBirth: day(30) })).status, 400);
  check('admission number already used is refused', (await call('PATCH', `/users/${s1.id}`, A, { admissionNumber: `AE-${sfx}` })).error?.code, 'DUPLICATE');
  check('email already used is refused', (await call('PATCH', `/users/${s1.id}`, A, { email: s2.email })).error?.code, 'DUPLICATE');
  check('a teacher has no admission number', (await call('PATCH', `/users/${t1.id}`, A, { admissionNumber: 'X1' })).status, 400);
  check('a student has no staff number', (await call('PATCH', `/users/${s1.id}`, A, { staffNumber: 'X1' })).status, 400);
  check('staff number changes for a teacher, but not to one in use', [(await call('PATCH', `/users/${t1.id}`, A, { staffNumber: `NEW-${sfx}` })).status, (await call('PATCH', `/users/${t1.id}`, A, { staffNumber: `SU-${sfx}` })).status], [200, 409]);
  const newEmail = `moved.${sfx}@example.com`;
  const em = await call('PATCH', `/users/${s2.id}`, A, { email: newEmail });
  check('email changes', em.data.user.email, newEmail);
  const old = await call('POST', '/auth/login', undefined, { email: s2.email, password: PW });
  const nw = await call('POST', '/auth/login', undefined, { email: newEmail, password: PW });
  check('the old email no longer signs in, the new one does', [old.status, nw.status], [401, 200]);
  const pend = await call('POST', '/users', A, { email: `pend.${sfx}@example.com`, role: 'parent', firstName: 'Pen', lastName: 'Ding' });
  const pm = await call('PATCH', `/users/${pend.data.user.id}`, A, { email: `pend2.${sfx}@example.com` });
  check('changing the email of a not-yet-activated account sends a fresh activation link', [typeof pm.data.activationLink, pm.data.activationLink.includes('token=')], ['string', true]);
  const audited = (await query("select metadata from audit_logs where action = 'user.updated' and entity_id = $1 order by id desc limit 1", [s2.id])).rows[0].metadata;
  check('the email change is audited with old and new values', [audited.email.from, audited.email.to], [s2.email, newEmail]);

  // ---------- csv import ----------
  const imp = (csv: string, dryRun = true, token = A) => call('POST', '/students/import', token, { csv, dryRun });
  const head = 'First Name,Last Name,Email Address,Admission No,Phone,DOB,Class';
  check('only the administrator can import', (await imp(head, true, t2.token)).status, 403);
  check('a missing required column is explained', (await imp('firstName,lastName\nA,B')).status, 400);
  check('a header with no students is refused', (await imp(head)).status, 400);
  const e1 = `ok1.${sfx}@example.com`; const e2 = `ok2.${sfx}@example.com`;
  const bad = [head, `Ada,Obi,${e1},IM1-${sfx},0801,2013-05-21,JSS 1${tag}`, `,Obi,notanemail,IM2-${sfx},,2099-01-01,JSS 9Z`, `Bo,Lee,${e1},IM1-${sfx},,13/13/2013,`, `Cy,Dee,${s1.email},AD2-${sfx},,,`].join('\n');
  const dv = await imp(bad);
  const fields = (r: number) => dv.data.errors.filter((e: any) => e.row === r).map((e: any) => e.field).sort();
  check('the check reports problems by line and field', [dv.data.canImport, dv.data.errorRows, fields(3), fields(4), fields(5)],
    [false, 3, ['class', 'dateOfBirth', 'email', 'firstName'], ['admissionNumber', 'dateOfBirth', 'email'], ['admissionNumber', 'email']]);
  check('a line that is fine has no errors', fields(2), []);
  check('importing a file with errors creates nothing', [(await imp(bad, false)).data.imported, (await query('select count(*)::int n from users where email = $1', [e1])).rows[0].n], [0, 0]);
  const good = [head, `Ada,Obi,${e1},IM1-${sfx},0801,2013-05-21,JSS 1${tag}`, `"Bo, Jr",Lee,${e2},IM2-${sfx},,,`].join('\r\n');
  const dry = await imp(good);
  check('a clean file passes the dry run and still creates nothing', [dry.data.canImport, dry.data.validRows, (await query('select count(*)::int n from users where email = $1', [e1])).rows[0].n], [true, 2, 0]);
  const done = await imp(good, false);
  check('importing creates the students', [done.status, done.data.imported], [200, 2]);
  const en = (await call('GET', `/academic/enrolments?sessionId=${sess.id}&classId=${c1.id}`, A)).data;
  check('students with a class are enrolled in the current session', en.map((e: any) => e.admissionNumber), [`IM1-${sfx}`]);
  check('a comma inside a quoted name is kept', (await query('select first_name from users where email = $1', [e2])).rows[0].first_name, 'Bo, Jr');
  check('importing the same file again is refused as duplicates', (await imp(good)).data.canImport, false);
  check('the import is audited', (await query("select count(*)::int n from audit_logs where action = 'students.imported'")).rows[0].n > 0, true);
  const many = [head, ...Array.from({ length: 501 }, (_, i) => `A,B,x${i}.${sfx}@example.com,N${i}-${sfx},,,`)].join('\n');
  check('more than 500 students in one file is refused', (await imp(many)).status, 400);
  check('a template can be downloaded', (await call('GET', '/students/import/template', A, undefined, true)).text.startsWith('firstName,lastName,email'), true);

  // ---------- audit viewer ----------
  check('only the administrator can read the audit log', [(await call('GET', '/admin/audit-logs', t1.token)).status, (await call('GET', '/admin/audit-logs', s1.token)).status], [403, 403]);
  const al = await call('GET', '/admin/audit-logs?action=user.updated', A);
  check('the log can be filtered by action', [al.status, al.data.items.length > 0, al.data.items.every((i: any) => i.action === 'user.updated')], [200, true, true]);
  check('entries show who did it', al.data.items[0].actorEmail, process.env.ADMIN_EMAIL);
  check('the log can be searched', (await call('GET', `/admin/audit-logs?q=${encodeURIComponent(newEmail)}`, A)).data.items.length > 0, true);
  check('the list of actions is available', (await call('GET', '/admin/audit-logs/actions', A)).data.includes('students.imported'), true);
  check('a bad date filter is refused', (await call('GET', '/admin/audit-logs?from=yesterday', A)).status, 400);
  check('the date filter works', (await call('GET', `/admin/audit-logs?from=${day(1)}`, A)).data.items.length, 0);

  // ---------- fee exports ----------
  const sum = await call('GET', `/fees/export/summary.csv?termId=${term.id}`, A, undefined, true);
  check('summary export is a CSV download', [sum.status, sum.headers.get('content-type'), sum.headers.get('content-disposition')], [200, 'text/csv; charset=utf-8', 'attachment; filename="fees-summary.csv"']);
  check('summary export has a header and an all-classes line', sum.text.replace('\uFEFF', '').split('\r\n').filter(Boolean).map((l) => l.split(',')[0]), ['Class', 'All classes']);
  check('invoice and payment exports have headers', [(await call('GET', `/fees/export/invoices.csv?termId=${term.id}`, A, undefined, true)).text.includes('Invoice,Student'), (await call('GET', `/fees/export/payments.csv?termId=${term.id}`, A, undefined, true)).text.includes('Receipt,Paid at')], [true, true]);
  check('exports are for administrators only', [(await call('GET', `/fees/export/summary.csv?termId=${term.id}`, t1.token, undefined, true)).status, (await call('GET', `/fees/export/payments.csv?termId=${term.id}`, s1.token, undefined, true)).status], [403, 403]);
  check('export of an unknown term is a not found', (await call('GET', '/fees/export/payments.csv?termId=00000000-0000-4000-8000-000000000000', A, undefined, true)).status, 404);

  // ---------- parents see assignments ----------
  const stuA = await newUser(A, 'student', { admissionNumber: `PA-${sfx}` }); const stuB = await newUser(A, 'student', { admissionNumber: `PB-${sfx}` });
  await call('POST', '/academic/enrolments', A, { studentId: stuA.id, classId: c1.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: maths.id, teacherId: t2.id });
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent');
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stuA.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: par2.id, studentId: stuB.id, relationship: 'father' });
  const asg = await call('POST', '/assignments', t2.token, { classId: c1.id, subjectId: maths.id, title: 'Fractions', description: 'secret description', instructions: 'secret instructions', maxMarks: 20, dueAt: new Date(Date.now() + 3 * 864e5).toISOString(), status: 'published' });
  const pa = await call('GET', `/parents/me/children/${stuA.id}/assignments`, par.token);
  check('a parent sees the linked child assignment with its status', [pa.status, pa.data.length, pa.data[0]?.title, pa.data[0]?.myStatus], [200, 1, 'Fractions', 'not_submitted']);
  check('parents do not receive the instructions meant for the student', ['instructions' in (pa.data[0] ?? {}), 'description' in (pa.data[0] ?? {})], [false, false]);
  check("a parent cannot read another family's child", (await call('GET', `/parents/me/children/${stuA.id}/assignments`, par2.token)).status, 404);
  check('students and teachers cannot use the parent endpoint', [(await call('GET', `/parents/me/children/${stuA.id}/assignments`, stuA.token)).status, (await call('GET', `/parents/me/children/${stuA.id}/assignments`, t2.token)).status], [403, 403]);
  await call('POST', `/assignments/${asg.data.id}/submissions`, stuA.token, { textResponse: 'my answer', fileIds: [] });
  check('the parent sees that it was handed in', (await call('GET', `/parents/me/children/${stuA.id}/assignments`, par.token)).data[0].myStatus, 'submitted');

  // ---------- applicant to student ----------
  const apply = (n: string, gEmail: string) => call('POST', '/public/admissions/apply', undefined, { firstName: n, lastName: 'Applicant', dateOfBirth: '2013-04-04', classStage: 'JSS', classYear: 1, guardianName: 'Mary Applicant', guardianPhone: '08031234567', guardianEmail: gEmail, address: '1 Test Street', consent: true, website: '' });
  const gE = `guard.${sfx}@example.com`;
  const ap = await apply('Zed', gE); const apId = (await query('select id from admission_applications where reference = $1', [ap.data.reference])).rows[0].id as string;
  const conv = (id: string, body: any, token = A) => call('POST', `/admin/site/applications/${id}/convert`, token, body);
  const ce = `zed.${sfx}@example.com`;
  check('only the administrator can convert', (await conv(apId, { email: ce, admissionNumber: `ZA-${sfx}` }, t1.token)).status, 403);
  check('an applicant without an offer cannot be converted', (await conv(apId, { email: ce, admissionNumber: `ZA-${sfx}` })).error?.code, 'NOT_OFFERED');
  await call('PATCH', `/admin/site/applications/${apId}/status`, A, { status: 'offered' });
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 1, arm: tag })).data;
  check('the class must match what they applied for', (await conv(apId, { email: ce, admissionNumber: `ZA-${sfx}`, classId: c2.id })).status, 400);
  check('a duplicate admission number is refused and creates nothing', [(await conv(apId, { email: ce, admissionNumber: `PA-${sfx}` })).error?.code, (await query('select count(*)::int n from users where email = $1', [ce])).rows[0].n], ['DUPLICATE', 0]);
  const ok1 = await conv(apId, { email: ce, admissionNumber: `ZA-${sfx}`, classId: c1.id, createParent: true });
  check('conversion creates the student, enrols them and creates the guardian', [ok1.status, ok1.data.parent], [201, 'created']);
  const stu = (await query('select u.role, sp.admission_number, sp.date_of_birth::text dob from users u join student_profiles sp on sp.user_id = u.id where u.id = $1', [ok1.data.studentId])).rows[0];
  check('the student has the applicant\'s name details and date of birth', [stu.role, stu.admission_number, stu.dob], ['student', `ZA-${sfx}`, '2013-04-04']);
  check('the student is in the class for the current session', (await query('select count(*)::int n from enrolments where student_id = $1 and class_id = $2 and session_id = $3', [ok1.data.studentId, c1.id, sess.id])).rows[0].n, 1);
  check('the guardian is linked as primary', (await query('select p.email::text, ps.is_primary from parent_students ps join users p on p.id = ps.parent_id where ps.student_id = $1', [ok1.data.studentId])).rows[0], { email: gE, is_primary: true });
  check('converting twice is refused', (await conv(apId, { email: `again.${sfx}@example.com`, admissionNumber: `ZB-${sfx}` })).error?.code, 'ALREADY_CONVERTED');
  check('the application records the student', (await call('GET', `/admin/site/applications/${apId}`, A)).data.convertedStudentId, ok1.data.studentId);
  const ap2 = await apply('Yan', gE); const ap2Id = (await query('select id from admission_applications where reference = $1', [ap2.data.reference])).rows[0].id as string;
  await call('PATCH', `/admin/site/applications/${ap2Id}/status`, A, { status: 'offered' });
  const ok2 = await conv(ap2Id, { email: `yan.${sfx}@example.com`, admissionNumber: `ZC-${sfx}`, createParent: true });
  check('a sibling links to the existing guardian account instead of creating another', [ok2.data.parent, (await query('select count(*)::int n from users where email = $1', [gE])).rows[0].n], ['linked', 1]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
