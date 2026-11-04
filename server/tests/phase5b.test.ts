// Needs: a Postgres DB with an active admin, and an API on :4000 started with
//   PAYSTACK_SECRET_KEY=sk_test_fake_secret_key PAYSTACK_BASE_URL=http://127.0.0.1:4010
// Run: ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase5b.test.ts
import crypto from 'crypto';
import { spawn } from 'child_process';
import { startFakePaystack } from './fake-paystack';

const B = 'http://localhost:4000/api';
const SECRET = 'sk_test_fake_secret_key';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method: string, path: string, token?: string, body?: unknown, base = B) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
const NAIRA = (n: number) => n * 100;
const sign = (raw: string) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');
async function webhook(payload: object, opts: { signature?: string | null; raw?: string; base?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.signature !== null) headers['x-paystack-signature'] = opts.signature ?? sign(raw);
  const res = await fetch((opts.base ?? 'http://localhost:4000') + '/api/webhooks/paystack', { method: 'POST', headers, body: raw });
  return res.status;
}
const chargeSuccess = (reference: string, amount: number, currency = 'NGN') => ({ event: 'charge.success', data: { id: Math.floor(Math.random() * 1e9), reference, amount, currency, status: 'success', gateway_response: 'Successful', channel: 'card', paid_at: new Date().toISOString(), authorization: { last4: '4081', bin: '408408', card_type: 'visa' }, customer: { email: 'x@y.z' } } });

(async () => {
  const fake = await startFakePaystack(4010);
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: '2026-09-14', endDate: '2026-12-18' })).data;
  const tag = 'P' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const cat = (await call('POST', '/fees/categories', A, { name: `Tuition ${sfx}` })).data;
  await call('PUT', '/fees/schedule', A, { termId: term.id, classId: cls.id, items: [{ categoryId: cat.id, amountKobo: NAIRA(100000) }] });
  const teacher = await newUser(A, 'teacher', { staffNumber: `PT-${sfx}` });
  const students = [] as { id: string; token: string; email: string }[];
  for (let n = 1; n <= 4; n++) { const s = await newUser(A, 'student', { admissionNumber: `P${n}-${sfx}` }); students.push(s); await call('POST', '/academic/enrolments', A, { studentId: s.id, classId: cls.id, sessionId: sess.id }); }
  const [s1, s2, s3, s4] = students;
  const p1 = await newUser(A, 'parent'); const p2 = await newUser(A, 'parent'); const p3 = await newUser(A, 'parent');
  await call('POST', '/parent-links', A, { parentId: p1.id, studentId: s1.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: p2.id, studentId: s2.id, relationship: 'father' });
  await call('POST', '/parent-links', A, { parentId: p3.id, studentId: s3.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: p3.id, studentId: s4.id, relationship: 'mother' });
  await call('POST', '/fees/invoices/generate', A, { termId: term.id, classId: cls.id });
  const list = (await call('GET', `/fees/invoices?termId=${term.id}`, A)).data.items as any[];
  const inv = (sid: string) => list.find((x) => x.studentId === sid);
  const [i1, i2, i3, i4] = [inv(s1.id), inv(s2.id), inv(s3.id), inv(s4.id)];
  const payments = async (invoiceId: string) => (await call('GET', `/fees/invoices/${invoiceId}`, A)).data.payments.filter((p: any) => !p.reversed) as any[];
  const init = (t: string, invoiceId: string, amountKobo?: number) => call('POST', `/parents/me/invoices/${invoiceId}/pay`, t, amountKobo ? { amountKobo } : {});
  const verify = (t: string, reference: string) => call('POST', '/parents/me/payments/verify', t, { reference });

  // ---- who may start a payment ----
  check('payer must be signed in', (await call('POST', `/parents/me/invoices/${i1.id}/pay`, undefined, {})).status, 401);
  check('a student cannot start a payment', (await init(s1.token, i1.id)).status, 403);
  check('a teacher cannot start a payment', (await init(teacher.token, i1.id)).status, 403);
  check("a parent cannot pay (or probe) another family's invoice", (await init(p2.token, i1.id)).status, 404);
  check('below the minimum online amount refused', (await init(p1.token, i1.id, 5000)).status, 400);
  check('more than the balance refused', (await init(p1.token, i1.id, NAIRA(100001))).status, 400);
  check('fractional kobo refused', (await init(p1.token, i1.id, 12345.5)).status, 400);
  check('no request reached Paystack for any refused attempt', fake.requests.length, 0);

  // ---- starting a payment ----
  const start = await init(p1.token, i1.id);
  check('payment started: Paystack page returned', [start.status, start.data.authorizationUrl, start.data.amountKobo], [201 === start.status ? 201 : 200, `https://checkout.fake/${start.data.reference}`, NAIRA(100000)]);
  const sent = fake.initiated.get(start.data.reference)!;
  check('Paystack was asked for exactly the invoice amount, in NGN, for this parent', [sent.amount, sent.currency, sent.email], [NAIRA(100000), 'NGN', p1.email]);
  check('Paystack was told where to send the parent back', sent.callback_url.endsWith(`/parent/fees/${i1.id}`), true);
  check('the secret key was sent as a bearer token', fake.requests[0].auth, `Bearer ${SECRET}`);
  check('the reference is long and unguessable', /^KOK-INV-\d{6}-[0-9a-f]{12}$/.test(start.data.reference), true);
  check('nothing is marked paid just because a payment was started', [(await payments(i1.id)).length, (await call('GET', `/parents/me/invoices/${i1.id}`, p1.token)).data.balanceKobo], [0, NAIRA(100000)]);
  const det = (await call('GET', `/parents/me/invoices/${i1.id}`, p1.token)).data;
  check('invoice page says online payment is available and lists the unfinished payment', [det.onlinePaymentAvailable, det.pendingPayments.length], [true, 1]);

  // ---- coming back from Paystack ----
  fake.outcomes.set(start.data.reference, { status: 'ongoing' });
  const waiting = await verify(p1.token, start.data.reference);
  check('still in progress at Paystack: nothing counted', [waiting.data.outcome, (await payments(i1.id)).length], ['pending', 0]);
  check("another parent cannot check someone else's payment", (await verify(p2.token, start.data.reference)).status, 404);
  check('an unknown reference is not found', (await verify(p1.token, 'KOK-INV-000000-doesnotexist')).status, 404);
  fake.outcomes.set(start.data.reference, { status: 'success' });
  const done = await verify(p1.token, start.data.reference);
  check('confirmed by Paystack: payment counted', [done.data.outcome, done.data.status], ['applied', 'success']);
  const afterPay = (await call('GET', `/fees/invoices/${i1.id}`, A)).data;
  check('invoice is paid, via Paystack, with a receipt number', [afterPay.status, afterPay.balanceKobo, afterPay.payments[0].method, afterPay.payments[0].reference === start.data.reference, afterPay.payments[0].receiptNumber.startsWith('RCT-')], ['paid', 0, 'paystack', true, true]);
  const again = await verify(p1.token, start.data.reference);
  check('checking again does not count it twice', [again.data.outcome, (await payments(i1.id)).length], ['already_applied', 1]);
  check('parent can open the receipt', (await call('GET', `/fees/payments/${afterPay.payments[0].id}/receipt`, p1.token)).status, 200);
  check('parent was told the payment arrived', ((await call('GET', '/notifications', p1.token)).data.items as any[]).some((n) => n.title.startsWith('Payment received')), true);
  check('a fully paid invoice cannot start another payment', (await init(p1.token, i1.id)).status, 409);

  // ---- the webhook ----
  const w1 = await init(p2.token, i2.id, NAIRA(40000));
  const body1 = chargeSuccess(w1.data.reference, NAIRA(40000));
  check('webhook with a bad signature is rejected', await webhook(body1, { signature: 'ab'.repeat(64) }), 401);
  check('webhook with no signature is rejected', await webhook(body1, { signature: null }), 401);
  check('webhook whose body was changed after signing is rejected', await webhook(body1, { signature: sign(JSON.stringify({ ...body1, tampered: true })) }), 401);
  check('rejected webhooks counted nothing', (await payments(i2.id)).length, 0);
  check('signed webhook accepted', await webhook(body1), 200);
  const sec = await payments(i2.id);
  check('payment counted from the webhook alone (parent never came back)', [sec.length, sec[0].amountKobo], [1, NAIRA(40000)]);
  check('the very same webhook delivered again is acknowledged but counts nothing', [await webhook(body1), (await payments(i2.id)).length], [200, 1]);
  const evs = (await query('select duplicate from paystack_events where reference = $1 order by received_at', [w1.data.reference])).rows.map((r: any) => r.duplicate);
  check('both deliveries are logged and the repeat is marked', evs, [false, true]);
  const stored = JSON.stringify((await query('select summary from paystack_events where reference = $1', [w1.data.reference])).rows);
  check('no card details or customer data are stored from the webhook', ['last4', '4081', 'bin', 'customer', 'authorization'].some((k) => stored.includes(k)), false);
  check('a verify after the webhook is also harmless', [(await verify(p2.token, w1.data.reference)).data.outcome, (await payments(i2.id)).length], ['already_applied', 1]);
  check('webhook for an unknown reference is acknowledged and ignored', [await webhook(chargeSuccess('KOK-INV-999999-unknown', 100)), (await query("select result from paystack_events where reference = 'KOK-INV-999999-unknown'")).rows[0].result], [200, 'unknown']);

  // wrong amount in an otherwise valid, signed webhook
  const w2 = await init(p2.token, i2.id, NAIRA(10000));
  check('webhook reporting a different amount is not counted', [await webhook(chargeSuccess(w2.data.reference, NAIRA(5000))), (await payments(i2.id)).length], [200, 1]);
  check('webhook reporting a different currency is not counted', [await webhook(chargeSuccess(w2.data.reference, NAIRA(10000), 'USD')), (await payments(i2.id)).length], [200, 1]);
  const flagged = (await call('GET', '/fees/online-payments?needsReview=true', A)).data.items as any[];
  check('the mismatch is flagged for the administrator', flagged.some((t) => t.reference === w2.data.reference && t.status === 'failed' && /Nothing was counted/.test(t.reviewNote)), true);

  // webhook and browser return arriving together
  const w3 = await init(p2.token, i2.id, NAIRA(10000));
  fake.outcomes.set(w3.data.reference, { status: 'success' });
  const raced = await Promise.all([webhook(chargeSuccess(w3.data.reference, NAIRA(10000))), verify(p2.token, w3.data.reference), webhook(chargeSuccess(w3.data.reference, NAIRA(10000))), verify(p2.token, w3.data.reference)]);
  check('webhook and redirect at the same instant: counted exactly once', [raced[0], raced[2], (await payments(i2.id)).filter((p) => p.reference === w3.data.reference).length, (await payments(i2.id)).length], [200, 200, 1, 2]);
  check('the database itself refuses a second payment with the same Paystack reference', await query("insert into payments (invoice_id, amount_kobo, method, reference) values ($1, 100, 'paystack', $2)", [i2.id, w3.data.reference]).then(() => 'inserted', (e: any) => e.code), '23505');

  // money arrives after the balance dropped
  const w4 = await init(p2.token, i2.id); // the whole remaining balance (₦50,000)
  check('started for the remaining balance', w4.data.amountKobo, NAIRA(50000));
  await call('POST', `/fees/invoices/${i2.id}/payments`, A, { amountKobo: NAIRA(20000), method: 'cash' });
  fake.outcomes.set(w4.data.reference, { status: 'success' });
  const late = await verify(p2.token, w4.data.reference);
  const i2now = (await call('GET', `/fees/invoices/${i2.id}`, A)).data;
  check('the money was real, so it is counted in full', [late.data.outcome, i2now.status, i2now.balanceKobo, i2now.paidKobo], ['applied', 'paid', 0, NAIRA(120000)]);
  const over = ((await call('GET', '/fees/online-payments?needsReview=true', A)).data.items as any[]).find((t) => t.reference === w4.data.reference);
  check('the overpayment is flagged with the amount', /Overpaid by ₦20,000.00/.test(over?.reviewNote ?? ''), true);
  check('the invoice never shows a negative balance', i2now.balanceKobo >= 0, true);

  // ---- failures ----
  fake.failNextInit = true;
  const before = (await query('select count(*)::int as n from paystack_transactions where invoice_id = $1', [i3.id])).rows[0].n;
  const bad = await init(p3.token, i3.id);
  check('if Paystack refuses to start, the parent is told nothing was charged', [bad.status, bad.error.code, /Nothing was charged/.test(bad.error.message)], [502, 'GATEWAY_ERROR', true]);
  check('and no phantom transaction is left behind', (await query('select count(*)::int as n from paystack_transactions where invoice_id = $1', [i3.id])).rows[0].n, before);
  const f1 = await init(p3.token, i3.id);
  fake.outcomes.set(f1.data.reference, { status: 'failed' });
  check('a declined card: nothing counted, status failed', [(await verify(p3.token, f1.data.reference)).data.outcome, (await payments(i3.id)).length], ['failed', 0]);
  const f2 = await init(p3.token, i3.id, NAIRA(30000));
  check('the parent can try again after a failure', f2.status === 200 || f2.status === 201, true);

  // ---- webhook never arrived: administrator re-checks ----
  fake.outcomes.set(f2.data.reference, { status: 'success' });
  const listed = ((await call('GET', '/fees/online-payments?status=pending', A)).data.items as any[]).find((t) => t.reference === f2.data.reference);
  check('administrator sees the payment still pending', !!listed, true);
  check('parents cannot see the reconciliation list', (await call('GET', '/fees/online-payments', p3.token)).status, 403);
  const rc = await call('POST', `/fees/online-payments/${listed.id}/recheck`, A);
  check('re-checking with Paystack counts a payment the webhook missed', [rc.data.outcome, (await payments(i3.id)).length, (await payments(i3.id))[0].amountKobo], ['applied', 1, NAIRA(30000)]);
  check('re-checking again changes nothing', [(await call('POST', `/fees/online-payments/${listed.id}/recheck`, A)).data.outcome, (await payments(i3.id)).length], ['already_applied', 1]);
  check('parent cannot trigger a re-check', (await call('POST', `/fees/online-payments/${listed.id}/recheck`, p3.token)).status, 403);

  // ---- disputes and refunds ----
  const paid3 = (await payments(i3.id))[0];
  await webhook({ event: 'charge.dispute.create', data: { reference: f2.data.reference, id: 1 } });
  const disputed = ((await call('GET', '/fees/online-payments?needsReview=true', A)).data.items as any[]).find((t) => t.reference === f2.data.reference);
  check('a dispute is flagged on the payment', /dispute/i.test(disputed?.reviewNote ?? ''), true);
  const revd = await call('POST', `/fees/payments/${paid3.id}/reverse`, A, { reason: 'Refunded in the Paystack dashboard' });
  check('after refunding in Paystack, the administrator can reverse it in the books', [revd.status, revd.data.paidKobo, revd.data.balanceKobo], [200, 0, NAIRA(100000)]);

  // ---- invoice cancelled while the parent was paying ----
  const c1 = await init(p3.token, i4.id);
  await call('POST', `/fees/invoices/${i4.id}/cancel`, A, { reason: 'Student withdrawn' });
  fake.outcomes.set(c1.data.reference, { status: 'success' });
  const cv = await verify(p3.token, c1.data.reference);
  const cNote = ((await call('GET', '/fees/online-payments?needsReview=true', A)).data.items as any[]).find((t) => t.reference === c1.data.reference);
  check('money that arrives for a cancelled invoice is not counted but is flagged for refund', [cv.data.outcome, (await payments(i4.id)).length, /refund the parent/i.test(cNote?.reviewNote ?? '')], ['invoice_cancelled', 0, true]);
  check('a cancelled invoice cannot start a new payment', (await init(p3.token, i4.id)).status, 409);

  // ---- when Paystack is not set up ----
  const child = spawn('npx', ['tsx', 'src/server.ts'], { env: { ...process.env, PORT: '4011', PAYSTACK_SECRET_KEY: '' }, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 7000));
  const off = 'http://localhost:4011/api';
  const offInit = await call('POST', `/parents/me/invoices/${i3.id}/pay`, p3.token, {}, off);
  check('without a Paystack key, paying online says it is unavailable', [offInit.status, offInit.error?.code], [503, 'PAYMENTS_UNAVAILABLE']);
  check('and the invoice page says so too', (await call('GET', `/parents/me/invoices/${i3.id}`, p3.token, undefined, off)).data.onlinePaymentAvailable, false);
  check('and the webhook endpoint refuses', await webhook(chargeSuccess('x', 1), { base: 'http://localhost:4011' }), 503);
  try { process.kill(-child.pid!); } catch { /* already gone */ }

  fake.close();
  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
