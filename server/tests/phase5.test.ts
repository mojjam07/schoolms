// API running on :4000, migrated DB, .env present, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase5.test.ts
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
const NAIRA = (n: number) => n * 100;

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: '2026-09-14', endDate: '2026-12-18' })).data;
  const tag = 'F' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'SSS', year: 1, arm: tag })).data;
  const teacher = await newUser(A, 'teacher', { staffNumber: `FT-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `F1-${sfx}` }); const s2 = await newUser(A, 'student', { admissionNumber: `F2-${sfx}` });
  const s3 = await newUser(A, 'student', { admissionNumber: `F3-${sfx}` }); const s4 = await newUser(A, 'student', { admissionNumber: `F4-${sfx}` });
  const p1 = await newUser(A, 'parent'); const p2 = await newUser(A, 'parent'); const p3 = await newUser(A, 'parent');
  for (const [s, c] of [[s1, c1], [s2, c1], [s4, c1], [s3, c2]] as const) await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s1.id, relationship: 'mother', isPrimary: true });
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s2.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: p2.id, studentId: s3.id, relationship: 'father' });

  // ---- who may use the fee tools ----
  check('fee tools need sign-in', (await call('GET', '/fees/categories')).status, 401);
  check('teacher cannot use fee tools', (await call('GET', '/fees/categories', teacher.token)).status, 403);
  check('parent cannot use admin fee tools', (await call('GET', '/fees/invoices', p1.token)).status, 403);
  check('student cannot record a payment', (await call('POST', `/fees/invoices/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/payments`, s1.token, { amountKobo: 100, method: 'cash' })).status, 403);

  // ---- categories and schedule ----
  const tuition = (await call('POST', '/fees/categories', A, { name: `Tuition ${sfx}`, description: 'Termly tuition' })).data;
  const books = (await call('POST', '/fees/categories', A, { name: `Books ${sfx}` })).data;
  check('category names are unique regardless of case', (await call('POST', '/fees/categories', A, { name: `TUITION ${sfx}` })).status, 409);
  const sched = await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c1.id, items: [{ categoryId: tuition.id, amountKobo: NAIRA(150000) }, { categoryId: books.id, amountKobo: NAIRA(20000) }] });
  check('schedule saved with its total', [sched.status, sched.data.items.length, sched.data.totalKobo], [200, 2, NAIRA(170000)]);
  check('zero amount refused', (await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c1.id, items: [{ categoryId: tuition.id, amountKobo: 0 }] })).status, 400);
  check('fractional kobo refused', (await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c1.id, items: [{ categoryId: tuition.id, amountKobo: 10.5 }] })).status, 400);
  check('same category twice refused', (await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c1.id, items: [{ categoryId: tuition.id, amountKobo: 1 }, { categoryId: tuition.id, amountKobo: 2 }] })).status, 400);

  // ---- generating invoices ----
  const gen1 = (await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: c1.id, dueDate: '2099-01-31' })).data;
  check('invoices generated for the class (not for other classes)', gen1, { created: 3, skippedExisting: 0, classesWithoutFees: 0 });
  check('generating again creates nothing new', (await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: c1.id })).data.skippedExisting, 3);
  check('a class with no fees set is reported, not invoiced', (await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: c2.id })).data, { created: 0, skippedExisting: 0, classesWithoutFees: 1 });
  await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c2.id, items: [{ categoryId: tuition.id, amountKobo: NAIRA(180000) }] });
  check('once fees are set the other class can be invoiced', (await call('POST', '/fees/invoices/generate', A, { termId: term.id })).data.created, 1);

  const all = (await call('GET', `/fees/invoices?termId=${term.id}`, A)).data;
  check('invoice list for the term', all.total, 4);
  const inv = (sid: string) => all.items.find((x: any) => x.studentId === sid);
  const i1 = inv(s1.id), i2 = inv(s2.id), i3 = inv(s3.id), i4 = inv(s4.id);
  check('invoice totals come from the schedule', [i1.totalKobo, i1.balanceKobo, i1.status, i3.totalKobo], [NAIRA(170000), NAIRA(170000), 'unpaid', NAIRA(180000)]);
  check('invoice numbers are unique', new Set(all.items.map((x: any) => x.number)).size, 4);
  check('invoice records the class and term', [i1.className, i1.termName], [`JSS 1${tag}`, 'First Term']);
  await call('PUT', '/fees/schedule', A, { termId: term.id, classId: c1.id, items: [{ categoryId: tuition.id, amountKobo: NAIRA(1) }] });
  check('changing the schedule later does not change invoices already issued', (await call('GET', `/fees/invoices/${i1.id}`, A)).data.totalKobo, NAIRA(170000));
  check('filter by class', (await call('GET', `/fees/invoices?termId=${term.id}&classId=${c2.id}`, A)).data.total, 1);
  check('search by admission number', (await call('GET', `/fees/invoices?termId=${term.id}&q=F2-${sfx}`, A)).data.items.map((x: any) => x.studentId), [s2.id]);

  // ---- discounts and extra charges ----
  check('a discount needs a reason', (await call('POST', `/fees/invoices/${i1.id}/lines`, A, { kind: 'discount', description: 'Sibling discount', amountKobo: NAIRA(10000), reason: '' })).status, 400);
  const disc = await call('POST', `/fees/invoices/${i1.id}/lines`, A, { kind: 'discount', description: 'Sibling discount', amountKobo: NAIRA(10000), reason: 'Second child at the school' });
  check('discount lowers the total and keeps its reason', [disc.status, disc.data.totalKobo, disc.data.lines.find((l: any) => l.kind === 'discount').reason], [201, NAIRA(160000), 'Second child at the school']);
  check('extra charge raises the total', (await call('POST', `/fees/invoices/${i1.id}/lines`, A, { kind: 'charge', description: 'Excursion', amountKobo: NAIRA(5000), reason: 'Class trip' })).data.totalKobo, NAIRA(165000));
  check('student cannot add a discount', (await call('POST', `/fees/invoices/${i1.id}/lines`, s1.token, { kind: 'discount', description: 'x', amountKobo: 100, reason: 'self-service' })).status, 403);

  // ---- payments ----
  const pay = (id: string, body: object, t = A) => call('POST', `/fees/invoices/${id}/payments`, t, body);
  check('payment above the balance refused', (await pay(i1.id, { amountKobo: NAIRA(165001), method: 'cash' })).status, 409);
  check('zero payment refused', (await pay(i1.id, { amountKobo: 0, method: 'cash' })).status, 400);
  check('"paystack" cannot be entered by hand', (await pay(i1.id, { amountKobo: 100, method: 'paystack' })).status, 400);
  check('payment dated in the future refused', (await pay(i1.id, { amountKobo: 100, method: 'cash', paidAt: new Date(Date.now() + 864e5).toISOString() })).status, 400);
  const part = await pay(i1.id, { amountKobo: NAIRA(65000), method: 'bank_transfer', reference: 'TRF-001', note: 'First instalment' });
  check('part payment recorded', [part.status, part.data.invoice.status, part.data.invoice.paidKobo, part.data.invoice.balanceKobo], [201, 'part_paid', NAIRA(65000), NAIRA(100000)]);
  const pid1 = part.data.paymentId;
  const rcpt = (await call('GET', `/fees/payments/${pid1}/receipt`, A)).data;
  check('receipt has its own number and the payment facts', [rcpt.receiptNumber.startsWith('RCT-'), rcpt.amountKobo, rcpt.method, rcpt.reference, rcpt.balanceKobo, rcpt.studentName], [true, NAIRA(65000), 'bank_transfer', 'TRF-001', NAIRA(100000), `student ${sfx}`]);
  check('discount below what is already paid refused', (await call('POST', `/fees/invoices/${i1.id}/lines`, A, { kind: 'discount', description: 'Big', amountKobo: NAIRA(120000), reason: 'Too much' })).status, 409);
  const rest = await pay(i1.id, { amountKobo: NAIRA(100000), method: 'cash' });
  check('final payment marks the invoice paid', [rest.data.invoice.status, rest.data.invoice.balanceKobo], ['paid', 0]);
  check('nothing more can be paid on a paid invoice', (await pay(i1.id, { amountKobo: 100, method: 'cash' })).status, 409);

  // two payments at the same instant must not both succeed
  const race = await Promise.all([pay(i2.id, { amountKobo: NAIRA(170000), method: 'cash', reference: 'RACE-A' }), pay(i2.id, { amountKobo: NAIRA(170000), method: 'pos', reference: 'RACE-B' })]);
  check('simultaneous full payments: exactly one wins', race.map((x) => x.status).sort(), [201, 409]);
  const afterRace = (await call('GET', `/fees/invoices/${i2.id}`, A)).data;
  check('and the books balance', [afterRace.paidKobo, afterRace.balanceKobo, afterRace.payments.length], [NAIRA(170000), 0, 1]);

  // ---- reversing ----
  const rev = await call('POST', `/fees/payments/${afterRace.payments[0].id}/reverse`, A, { reason: 'Cheque bounced' });
  check('reversing restores the balance and keeps the record', [rev.data.status, rev.data.balanceKobo, rev.data.payments[0].reversed, rev.data.payments[0].reverseReason], ['unpaid', NAIRA(170000), true, 'Cheque bounced']);
  check('reversing twice refused', (await call('POST', `/fees/payments/${afterRace.payments[0].id}/reverse`, A, { reason: 'again please' })).status, 409);
  check('a reason is required to reverse', (await call('POST', `/fees/payments/${pid1}/reverse`, A, { reason: '' })).status, 400);

  // ---- cancelling ----
  check('cannot cancel an invoice with payments', (await call('POST', `/fees/invoices/${i1.id}/cancel`, A, { reason: 'Raised by mistake' })).status, 409);
  const canc = await call('POST', `/fees/invoices/${i4.id}/cancel`, A, { reason: 'Student left the school' });
  check('cancel an unpaid invoice', [canc.data.status, canc.data.balanceKobo], ['cancelled', 0]);
  check('cancelled invoice takes no payment', (await pay(i4.id, { amountKobo: 100, method: 'cash' })).status, 409);
  check('cancelled invoice takes no discount', (await call('POST', `/fees/invoices/${i4.id}/lines`, A, { kind: 'discount', description: 'Test discount', amountKobo: 100, reason: 'Should be refused' })).status, 409);

  // ---- report (billed = invoice totals, collected = confirmed payments) ----
  const rep = (await call('GET', `/fees/report?termId=${term.id}`, A)).data;
  const billed = NAIRA(165000) + NAIRA(170000) + NAIRA(180000); // i1 (after discount + charge), i2, i3 ; i4 cancelled
  check('report totals', [rep.billedKobo, rep.collectedKobo, rep.outstandingKobo, rep.invoices], [billed, NAIRA(165000), NAIRA(350000), 3]);
  check('report by class', rep.byClass.map((c: any) => [c.className, c.billedKobo, c.studentsOwing]), [[`SSS 1${tag}`, NAIRA(180000), 1], [`JSS 1${tag}`, NAIRA(335000), 1]]);
  check('overdue counts only past-due balances', rep.studentsOverdue, 0);
  await call('PATCH', `/fees/invoices/${i2.id}/due-date`, A, { dueDate: '2020-01-01' });
  check('past due date makes it overdue', [(await call('GET', `/fees/invoices?termId=${term.id}&status=overdue`, A)).data.items.map((x: any) => x.studentId)], [[s2.id]]);
  check('status filters', [(await call('GET', `/fees/invoices?termId=${term.id}&status=paid`, A)).data.total, (await call('GET', `/fees/invoices?termId=${term.id}&status=unpaid`, A)).data.total, (await call('GET', `/fees/invoices?termId=${term.id}&status=cancelled`, A)).data.total], [1, 2, 1]);

  // ---- families only see their own children ----
  check('parent sees only linked children invoices', [(await call('GET', '/parents/me/invoices', p1.token)).data.map((x: any) => x.studentId).sort()], [[s1.id, s2.id].sort()]);
  check('another parent sees only theirs', (await call('GET', '/parents/me/invoices', p2.token)).data.map((x: any) => x.studentId), [s3.id]);
  check('unlinked parent sees nothing', (await call('GET', '/parents/me/invoices', p3.token)).data, []);
  check("parent cannot open another family's invoice", (await call('GET', `/parents/me/invoices/${i3.id}`, p1.token)).status, 404);
  const mine = await call('GET', `/parents/me/invoices/${i1.id}`, p1.token);
  check('parent sees own invoice detail without guardian details', [mine.status, mine.data.lines.length, mine.data.payments.length, 'guardians' in mine.data], [200, 4, 2, false]);
  check('parent can open a receipt for their child', (await call('GET', `/fees/payments/${pid1}/receipt`, p1.token)).status, 200);
  check("parent cannot open another family's receipt", (await call('GET', `/fees/payments/${pid1}/receipt`, p2.token)).status, 404);
  check('teacher cannot open receipts', (await call('GET', `/fees/payments/${pid1}/receipt`, teacher.token)).status, 403);
  check('parent cannot reverse a payment', (await call('POST', `/fees/payments/${pid1}/reverse`, p1.token, { reason: 'because I can' })).status, 403);
  const stu = (await call('GET', '/students/me/invoices', s1.token)).data;
  check('student sees own tuition status only (no payment details)', [stu.length, stu[0].status, stu[0].balanceKobo, 'payments' in stu[0]], [1, 'paid', 0, false]);
  check('student cannot see a classmate via their own list', (await call('GET', '/students/me/invoices', s2.token)).data.map((x: any) => x.id), [i2.id]);

  // ---- payment confirmations ----
  const pTitles = ((await call('GET', '/notifications', p1.token)).data.items as any[]).map((n) => n.title);
  check('guardian was told about each payment', pTitles.filter((t) => t.startsWith('Payment received')).length, 3);
  check('other family was not told', ((await call('GET', '/notifications', p2.token)).data.items as any[]).some((n) => n.title.startsWith('Payment received')), false);

  // ---- reminders ----
  const rem = (await call('POST', '/fees/reminders', A, { termId: term.id })).data;
  check('reminders go to invoices with a balance (cancelled and paid are skipped)', [rem.invoices, rem.noLinkedGuardian, rem.inAppSent], [2, 0, 2]);
  check('email results are reported honestly (no provider configured here)', [rem.emailsAccepted, rem.emailsNotSent, rem.emailsFailed], [0, 2, 0]);
  const remNote = ((await call('GET', '/notifications', p1.token)).data.items as any[]).find((n) => n.title.startsWith('School fees reminder'));
  check('reminder names the child, the term and the balance, and links to the invoice', [remNote.title, remNote.body.includes('First Term'), remNote.body.includes('₦170,000.00'), remNote.link], [`School fees reminder: student ${sfx}`, true, true, `/parent/fees/${i2.id}`]);
  check('the other family gets their own reminder', ((await call('GET', '/notifications', p2.token)).data.items as any[]).some((n) => n.title.startsWith('School fees reminder') && n.body.includes('₦180,000.00')), true);
  check('unlinked parent gets nothing', (await call('GET', '/notifications', p3.token)).data.total, 0);
  const again = (await call('POST', '/fees/reminders', A, { termId: term.id })).data;
  check('a second reminder the same day is not sent again', [again.inAppSent, again.alreadySentToday], [0, 2]);
  check('reminding a fully paid invoice refused', (await call('POST', '/fees/reminders', A, { invoiceIds: [i1.id] })).status, 409);
  const one = (await call('POST', '/fees/reminders', A, { invoiceIds: [i3.id], message: 'Please see the bursar.' })).data;
  check('an individual reminder (already sent today) is also de-duplicated', [one.invoices, one.alreadySentToday], [1, 1]);
  const noGuardian = (await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: c1.id })).data; void noGuardian;
  const s5 = await newUser(A, 'student', { admissionNumber: `F5-${sfx}` });
  await call('POST', '/academic/enrolments', A, { studentId: s5.id, classId: c1.id, sessionId: sess.id });
  await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: c1.id });
  const ng = (await call('POST', '/fees/reminders', A, { termId: term.id, classId: c1.id })).data;
  check('a student with no linked guardian is reported, nobody else is contacted', [ng.noLinkedGuardian >= 1], [true]);

  // ---- audit trail ----
  const audits = (await query("select action, actor_id from audit_logs where entity_id = $1 or metadata->>'invoiceId' = $1 or entity_id = $2", [i1.id, term.id])).rows;
  const acts = new Set(audits.map((a: any) => a.action));
  check('discounts, payments and reminders are all in the audit log', ['invoice.discount_added', 'payment.recorded', 'fee_reminders.sent', 'invoices.generated'].every((a) => acts.has(a)), true);
  check('audit entries record who did it', audits.every((a: any) => !!a.actor_id), true);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
