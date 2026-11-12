// Family account (contact details, guardian-link correction requests) and notification preferences.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase15.test.ts   (API on :4000, fresh process)
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

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent'); const tch = await newUser(A, 'teacher', { staffNumber: `FA-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `FA1-${sfx}` }); const s2 = await newUser(A, 'student', { admissionNumber: `FA2-${sfx}` });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: s1.id, relationship: 'guardian', isPrimary: true });
  await call('POST', '/parent-links', A, { parentId: par2.id, studentId: s2.id, relationship: 'father' });

  check('account endpoints are for parents; admin endpoints for administrators', [
    (await call('GET', '/family/me', tch.token)).status, (await call('GET', '/family/admin/requests', par.token)).status, (await call('GET', '/family/me')).status], [403, 403, 401]);

  // ---------- contact details ----------
  check('a parent updates phone and address', [(await call('PATCH', '/family/me/contact', par.token, { phone: '0803 123 4567', address: '12 Test Street, Oshodi' })).status, (await call('GET', '/family/me', par.token)).data.contact.phone], [200, '0803 123 4567']);
  check('letters in a phone number and an empty change are refused', [(await call('PATCH', '/family/me/contact', par.token, { phone: 'call me' })).status, (await call('PATCH', '/family/me/contact', par.token, {})).status], [400, 400]);
  check('the contact update is audited', (await query("select count(*)::int n from audit_logs where action = 'family.contact_updated' and entity_id = $1", [par.id])).rows[0].n, 1);
  check('the email address cannot be changed here', (await call('PATCH', '/family/me/contact', par.token, { phone: '0803', email: 'x@example.com' })).status, 200);
  check('…and is unchanged', (await call('GET', '/family/me', par.token)).data.contact.email, par.email);

  // ---------- requests ----------
  const bad1 = await call('POST', '/family/me/requests', par.token, { kind: 'relationship', studentId: s2.id, proposedRelationship: 'mother', note: 'Wrong child' });
  check('a parent cannot raise a request about a child who is not linked to them', bad1.status, 403);
  check('a relationship request needs the new relationship; an add request needs a name or number', [
    (await call('POST', '/family/me/requests', par.token, { kind: 'relationship', studentId: s1.id, note: 'x' })).status, (await call('POST', '/family/me/requests', par.token, { kind: 'add', note: 'x' })).status], [400, 400]);
  const rq = await call('POST', '/family/me/requests', par.token, { kind: 'relationship', studentId: s1.id, proposedRelationship: 'mother', note: 'I am his mother, not a guardian.' });
  check('a relationship correction is sent', rq.status, 201);
  check('every administrator is notified', (await query("select count(*)::int n from notifications where entity_id = $1 and type = 'family_request'", [rq.data.id])).rows[0].n >= 1, true);
  check('a second open request about the same child is refused', (await call('POST', '/family/me/requests', par.token, { kind: 'relationship', studentId: s1.id, proposedRelationship: 'father', note: 'again' })).status, 409);
  check('nothing changes until the school approves', (await query('select relationship, is_primary from parent_students where parent_id = $1 and student_id = $2', [par.id, s1.id])).rows[0], { relationship: 'guardian', is_primary: true });
  check('another parent cannot cancel it', (await call('POST', `/family/me/requests/${rq.data.id}/cancel`, par2.token, {})).status, 404);

  // ---------- administrator decisions ----------
  const pending = await call('GET', '/family/admin/requests?status=pending', A);
  check('the administrator sees it with the current and requested relationship', pending.data.items.filter((r: any) => r.id === rq.data.id).map((r: any) => [r.currentRelationship, r.proposedRelationship]), [['guardian', 'mother']]);
  check('approving applies it and keeps the primary-contact flag', [(await call('POST', `/family/admin/requests/${rq.data.id}/decide`, A, { decision: 'approve', note: 'Verified at the office' })).status,
    (await query('select relationship, is_primary from parent_students where parent_id = $1 and student_id = $2', [par.id, s1.id])).rows[0]], [200, { relationship: 'mother', is_primary: true }]);
  check('the parent is told, and a decided request cannot be decided again', [(await query("select count(*)::int n from notifications where user_id = $1 and entity_id = $2", [par.id, rq.data.id])).rows[0].n, (await call('POST', `/family/admin/requests/${rq.data.id}/decide`, A, { decision: 'decline' })).status], [1, 409]);

  const add = await call('POST', '/family/me/requests', par.token, { kind: 'add', childName: 'Second Child', admissionNumber: `FA2-${sfx}`, proposedRelationship: 'mother', note: 'My other child.' });
  check('approving an add request finds the student by admission number', [(await call('POST', `/family/admin/requests/${add.data.id}/decide`, A, { decision: 'approve' })).status,
    (await query('select relationship, is_primary from parent_students where parent_id = $1 and student_id = $2', [par.id, s2.id])).rows[0]], [200, { relationship: 'mother', is_primary: false }]);
  const rm = await call('POST', '/family/me/requests', par.token, { kind: 'remove', studentId: s2.id, note: 'No longer my responsibility.' });
  check('a declined removal changes nothing', [(await call('POST', `/family/admin/requests/${rm.data.id}/decide`, A, { decision: 'decline', note: 'Please call the office' })).status,
    (await query('select count(*)::int n from parent_students where parent_id = $1 and student_id = $2', [par.id, s2.id])).rows[0].n], [200, 1]);
  const rm2 = await call('POST', '/family/me/requests', par.token, { kind: 'remove', studentId: s2.id, note: 'Please remove.' });
  check('an approved removal deletes the link', [(await call('POST', `/family/admin/requests/${rm2.data.id}/decide`, A, { decision: 'approve' })).status,
    (await query('select count(*)::int n from parent_students where parent_id = $1 and student_id = $2', [par.id, s2.id])).rows[0].n], [200, 0]);
  const c = await call('POST', '/family/me/requests', par.token, { kind: 'relationship', studentId: s1.id, proposedRelationship: 'guardian', note: 'oops' });
  check('a parent can cancel their own open request, which then cannot be approved', [(await call('POST', `/family/me/requests/${c.data.id}/cancel`, par.token, {})).status, (await call('POST', `/family/admin/requests/${c.data.id}/decide`, A, { decision: 'approve' })).status], [200, 409]);

  // ---------- preferences ----------
  const p0 = (await call('GET', '/family/preferences', tch.token)).data;
  check('everything is on by default, for any role', [p0.categories.length, p0.categories.every((x: any) => x.inApp && x.email)], [7, true]);
  const put = await call('PUT', '/family/preferences', tch.token, { preferences: [{ category: 'fees', inApp: true, email: false }, { category: 'announcements', inApp: false, email: false }] });
  check('choices are saved and returned', put.data.categories.filter((x: any) => !x.email || !x.inApp).map((x: any) => [x.key, x.inApp, x.email]), [['fees', true, false], ['announcements', false, false]]);
  check('an unknown category is refused', (await call('PUT', '/family/preferences', tch.token, { preferences: [{ category: 'security', inApp: false, email: false }] })).status, 400);
  check('one person’s choices never affect another’s', (await call('GET', '/family/preferences', par.token)).data.categories.every((x: any) => x.inApp && x.email), true);
  const { wants } = await import('../src/modules/family/preferences.service');
  check('the sender helper honours them, and always allows unknown (account/security) types', [await wants(tch.id, 'fee_reminder', 'email'), await wants(tch.id, 'fee_reminder', 'in_app'), await wants(tch.id, 'announcement_posted', 'in_app'), await wants(tch.id, 'password_reset', 'email')], [false, true, false, true]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
