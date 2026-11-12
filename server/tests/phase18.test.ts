// PDF receipts and fee statements: access control, content type, reversed payments.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase18.test.ts   (API on :4000, fresh process)
const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;
async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function raw(path: string, token?: string) {
  const res = await fetch(B + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', buf };
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

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const stu = await newUser(A, 'student', { admissionNumber: `PD-${sfx}` }); const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent'); const tch = await newUser(A, 'teacher', { staffNumber: `PT-${sfx}` });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu.id, relationship: 'mother' });
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  const term = (await query('select id from terms where session_id = $1 order by term_number limit 1', [sess.id])).rows[0];
  const tag = 'P' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const inv = (await query('insert into invoices (student_id, term_id, class_id) values ($1,$2,$3) returning id', [stu.id, term.id, cls.id])).rows[0].id;
  await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo) values ($1,'fee','Tuition', 10000000)`, [inv]);
  await query(`insert into invoice_lines (invoice_id, kind, description, amount_kobo, reason) values ($1,'discount','Sibling discount', -1000000, 'Second child')`, [inv]);
  const pay = (await query(`insert into payments (invoice_id, amount_kobo, method, reference) values ($1, 4000000, 'bank_transfer', 'TRF-123') returning id, receipt_number`, [inv])).rows[0];
  const bad = (await query(`insert into payments (invoice_id, amount_kobo, method) values ($1, 500000, 'cash') returning id`, [inv])).rows[0]; await query('update payments set reversed_at = now() where id = $1', [bad.id]);

  const st = await raw(`/pdf/invoices/${inv}`, A);
  check('an administrator gets a fee statement as a PDF', [st.status, st.type, st.buf.subarray(0, 5).toString(), st.buf.length > 1000], [200, 'application/pdf', '%PDF-', true]);
  check('it downloads with a sensible file name', st.disposition.includes('statement-INV-') && st.disposition.includes('.pdf'), true);
  const rc = await raw(`/pdf/receipts/${pay.id}`, A);
  check('an administrator gets a receipt as a PDF named after the receipt number', [rc.status, rc.buf.subarray(0, 5).toString(), rc.disposition.includes(pay.receipt_number)], [200, '%PDF-', true]);
  check('the linked parent gets both', [(await raw(`/pdf/invoices/${inv}`, par.token)).status, (await raw(`/pdf/receipts/${pay.id}`, par.token)).status], [200, 200]);
  check('another parent gets a 404 for both, without learning the invoice exists', [(await raw(`/pdf/invoices/${inv}`, par2.token)).status, (await raw(`/pdf/receipts/${pay.id}`, par2.token)).status], [404, 404]);
  check('teachers and students are refused, and so is a signed-out request', [(await raw(`/pdf/invoices/${inv}`, tch.token)).status, (await raw(`/pdf/invoices/${inv}`, stu.token)).status, (await raw(`/pdf/invoices/${inv}`)).status], [403, 403, 401]);
  const rev = await raw(`/pdf/receipts/${bad.id}`, A);
  check('a reversed payment has no receipt (409, as JSON, not a broken PDF)', [rev.status, rev.type.includes('json')], [409, true]);
  check('a made-up or malformed id is a clean error', [(await raw(`/pdf/invoices/00000000-0000-0000-0000-000000000000`, A)).status, (await raw(`/pdf/invoices/not-a-uuid`, A)).status], [404, 400]);
  check('the PDFs are not cached by browsers or proxies', (await fetch(`${B}/pdf/invoices/${inv}`, { headers: { Authorization: `Bearer ${A}` } })).headers.get('cache-control'), 'private, no-store');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
