// Instalment plans: building, validation, payment matching, privacy, reminders.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase17.test.ts   (API on :4000, fresh process)
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
const day = (ahead: number) => new Date(Date.now() + ahead * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

(async () => {
  const { query } = await import('../src/db/pool');
  const { allocate } = await import('../src/modules/instalments/instalments.service');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const stu = await newUser(A, 'student', { admissionNumber: `IN-${sfx}` }); const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent'); const tch = await newUser(A, 'teacher', { staffNumber: `IT-${sfx}` });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu.id, relationship: 'mother' });

  // ---------- the matching rule on its own ----------
  const sample = [{ position: 1, dueDate: '2100-01-10', amountKobo: 300 }, { position: 2, dueDate: '2100-02-10', amountKobo: 300 }, { position: 3, dueDate: '2100-03-10', amountKobo: 400 }];
  check('payments fill instalments oldest first', allocate(sample, 450, '2100-01-01').map((i) => [i.paidKobo, i.status]), [[300, 'paid'], [150, 'partial'], [0, 'upcoming']]);
  check('an unpaid instalment past its date is overdue; overpayment changes nothing', [allocate(sample, 0, '2100-01-20').map((i) => i.status), allocate(sample, 5000, '2100-01-20').every((i) => i.status === 'paid')], [['overdue', 'upcoming', 'upcoming'], true]);

  // ---------- set-up ----------
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await query('select id from terms where session_id = $1 order by term_number limit 1', [sess.id])).rows[0];
  const tag = 'I' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  await call('POST', '/academic/enrolments', A, { studentId: stu.id, classId: cls.id, sessionId: sess.id });
  const invId = (await query('insert into invoices (student_id, term_id, class_id) values ($1,$2,$3) returning id', [stu.id, term.id, cls.id])).rows[0].id;
  await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo) values ($1,'fee','Tuition', 10000000)`, [invId]);

  check('roles are enforced', [(await call('GET', `/instalments/admin/invoice/${invId}`, par.token)).status, (await call('GET', `/instalments/parent/invoice/${invId}`, A)).status, (await call('GET', `/instalments/admin/invoice/${invId}`)).status], [403, 403, 401]);
  const none = (await call('GET', `/instalments/admin/invoice/${invId}`, A)).data;
  check('an invoice starts with no plan', [none.hasPlan, none.totalKobo], [false, 10000000]);

  const sg = (await call('GET', `/instalments/admin/invoice/${invId}/suggest?count=3&firstDue=${day(-40)}&gapDays=30`, A)).data;
  check('the equal split adds up exactly, with the odd kobo on the last one', [sg.instalments.map((i: any) => i.amountKobo), sg.instalments.reduce((n: number, i: any) => n + i.amountKobo, 0)], [[3333333, 3333333, 3333334], 10000000]);

  const bad = (body: unknown) => call('PUT', `/instalments/admin/invoice/${invId}`, A, body);
  check('a plan that does not add up to the invoice is refused', (await bad({ instalments: [{ dueDate: day(1), amountKobo: 1 }, { dueDate: day(2), amountKobo: 2 }] })).status, 400);
  check('dates out of order, one instalment, and seven instalments are refused', [
    (await bad({ instalments: [{ dueDate: day(5), amountKobo: 5000000 }, { dueDate: day(2), amountKobo: 5000000 }] })).status, (await bad({ instalments: [{ dueDate: day(5), amountKobo: 10000000 }] })).status,
    (await bad({ instalments: Array.from({ length: 7 }, (_, k) => ({ dueDate: day(k + 1), amountKobo: 1 })) })).status], [400, 400, 400]);
  check('a good plan is saved', (await bad({ instalments: sg.instalments.map((i: any) => ({ dueDate: i.dueDate, amountKobo: i.amountKobo })) })).status, 200);
  check('the plan is audited', (await query("select count(*)::int n from audit_logs where action = 'instalments.set' and entity_id = $1", [invId])).rows[0].n, 1);

  // ---------- payments are matched to instalments ----------
  await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 4000000, 'cash')`, [invId]);
  const rev = (await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 1000000, 'cash') returning id`, [invId])).rows[0].id; await query('update payments set reversed_at = now() where id = $1', [rev]);
  const plan = (await call('GET', `/instalments/admin/invoice/${invId}`, A)).data;
  check('4,000,000 paid (a reversed payment ignored): first paid, second part-paid and overdue, third upcoming', plan.instalments.map((i: any) => [i.paidKobo, i.status]), [[3333333, 'paid'], [666667, 'overdue'], [0, 'upcoming']]);
  check('the next due instalment is the second, with what is still owed', [plan.next.dueDate, plan.next.remainingKobo], [sg.instalments[1].dueDate, 2666666]);

  // ---------- privacy ----------
  check('the linked parent sees the plan; another parent gets a 404', [(await call('GET', `/instalments/parent/invoice/${invId}`, par.token)).data.instalments.length, (await call('GET', `/instalments/parent/invoice/${invId}`, par2.token)).status], [3, 404]);

  // ---------- reminders ----------
  const dry = (await (await import('../src/modules/instalments/instalments.service')).sendReminders(false));
  check('a dry run reports the overdue instalment and sends nothing', [dry.overdue >= 1, (await query("select count(*)::int n from notifications where user_id = $1 and type = 'fee_instalment_reminder'", [par.id])).rows[0].n], [true, 0]);
  await (await import('../src/modules/instalments/instalments.service')).sendReminders(true);
  check('the parent is reminded once about the overdue instalment', (await query("select count(*)::int n from notifications where user_id = $1 and type = 'fee_instalment_reminder'", [par.id])).rows[0].n, 1);
  await (await import('../src/modules/instalments/instalments.service')).sendReminders(true);
  check('running again does not send the same reminder twice', (await query("select count(*)::int n from notifications where user_id = $1 and type = 'fee_instalment_reminder'", [par.id])).rows[0].n, 1);
  check('a parent who turned off fee notifications is not reminded', (await (async () => {
    await call('PUT', '/family/preferences', par2.token, { preferences: [{ category: 'fees', inApp: false, email: true }] });
    await call('POST', '/parent-links', A, { parentId: par2.id, studentId: stu.id, relationship: 'father' });
    await query('update invoice_instalments set reminded_overdue_at = null where invoice_id = $1', [invId]);
    await (await import('../src/modules/instalments/instalments.service')).sendReminders(true);
    return (await query("select count(*)::int n from notifications where user_id = $1 and type = 'fee_instalment_reminder'", [par2.id])).rows[0].n;
  })()), 0);

  // ---------- the invoice changes after the plan ----------
  await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo) values ($1,'charge','Late fee', 50000)`, [invId]);
  check('a plan that no longer matches the invoice is flagged', (await call('GET', `/instalments/admin/invoice/${invId}`, A)).data.outOfDate, true);

  // ---------- removing ----------
  check('the plan can be removed; payments are untouched', [(await call('DELETE', `/instalments/admin/invoice/${invId}`, A)).status, (await query('select count(*)::int n from payments where invoice_id = $1', [invId])).rows[0].n, (await call('GET', `/instalments/admin/invoice/${invId}`, A)).data.hasPlan], [200, 2, false]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
