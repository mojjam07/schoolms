// Data protection: retention cleanup rules and the personal-data export.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase11.test.ts   (API on :4000, fresh process)
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
  const par = await newUser(A, 'parent'); const tch = await newUser(A, 'teacher', { staffNumber: `DT-${sfx}` });

  check('only administrators can use the data tools', [(await call('GET', '/admin/data/retention', par.token)).status, (await call('POST', '/admin/data/retention/run', tch.token)).status, (await call('GET', `/admin/data/export?email=${par.email}`, par.token)).status, (await call('GET', '/admin/data/retention')).status], [403, 403, 403, 401]);

  // ---------- seed old and new records ----------
  const old = "now() - interval '3 years'";
  const n1 = (await query(`insert into notifications (user_id, type, title, read_at, created_at) values ($1,'t','old read', ${old}, ${old}) returning id`, [par.id])).rows[0].id;
  const n2 = (await query("insert into notifications (user_id, type, title, read_at) values ($1,'t','fresh read', now()) returning id", [par.id])).rows[0].id;
  const n3 = (await query("insert into notifications (user_id, type, title) values ($1,'t','fresh unread') returning id", [par.id])).rows[0].id;
  const c1 = (await query(`insert into contact_messages (name, email, subject, message, status, consent_at, created_at) values ('A','a@example.com','old archived','x','archived', now(), ${old}) returning id`)).rows[0].id;
  const c2 = (await query(`insert into contact_messages (name, email, subject, message, status, consent_at, created_at) values ('B','b@example.com','old but unread','x','new', now(), ${old}) returning id`)).rows[0].id;
  const ap = (await query(`insert into admission_applications (first_name,last_name,date_of_birth,class_stage,class_year,guardian_name,guardian_phone,guardian_email,status,consent_at,updated_at)
     values ('Old','Decline','2012-01-01','JSS',1,'G','0800','g.${sfx}@example.com','declined', now(), ${old}) returning id`)).rows[0].id;
  const ap2 = (await query(`insert into admission_applications (first_name,last_name,date_of_birth,class_stage,class_year,guardian_name,guardian_phone,guardian_email,status,consent_at,updated_at)
     values ('Old','Offered','2012-01-01','JSS',1,'G','0800','h.${sfx}@example.com','offered', now(), ${old}) returning id`)).rows[0].id;
  const tok = (await query(`insert into auth_tokens (user_id, purpose, token_hash, expires_at) values ($1,'password_reset','h-${sfx}', ${old}) returning id`, [par.id])).rows[0].id;
  const f1 = (await query(`insert into files (owner_id, purpose, original_name, mime_type, size_bytes, storage_key, created_at) values ($1,'resource','lost.pdf','application/pdf',10,'k-${sfx}', ${old}) returning id`, [tch.id])).rows[0].id;

  const pv = await call('GET', '/admin/data/retention', A);
  const due = (k: string) => pv.data.rules.find((r: any) => r.key === k).count as number;
  check('the preview counts what is due and changes nothing', [due('read_notifications') >= 1, due('contact_messages') >= 1, due('applications') >= 1, due('auth_tokens') >= 1, pv.data.files.count >= 1,
    (await query('select count(*)::int n from notifications where id = $1', [n1])).rows[0].n], [true, true, true, true, true, 1]);
  check('the closed-conversation rule is off until the school sets a period', pv.data.rules.find((r: any) => r.key === 'closed_threads').enabled, false);

  const run = await call('POST', '/admin/data/retention/run', A);
  check('the cleanup runs', run.status, 200);
  const has = async (table: string, id: string) => (await query(`select count(*)::int n from ${table} where id = $1`, [id])).rows[0].n as number;
  check('old read notification, archived enquiry, declined application and old token are removed', [await has('notifications', n1), await has('contact_messages', c1), await has('admission_applications', ap), await has('auth_tokens', tok)], [0, 0, 0, 0]);
  check('recent notifications, an unread enquiry and an application still in progress are kept', [await has('notifications', n2), await has('notifications', n3), await has('contact_messages', c2), await has('admission_applications', ap2)], [1, 1, 1, 1]);
  check('an unattached file is kept while file removal is not connected, and reported so', [await has('files', f1), run.data.files.connected], [1, false]);
  check('the run is audited', (await query("select count(*)::int n from audit_logs where action = 'data.retention_run'")).rows[0].n >= 1, true);
  check('running twice removes nothing more', Object.values((await call('POST', '/admin/data/retention/run', A)).data.removed).every((n) => n === 0), true);

  // ---------- export ----------
  await call('POST', '/notifications/read-all', par.token);
  const ex = await call('GET', `/admin/data/export?email=${encodeURIComponent(par.email)}`, A);
  check('the export has the person’s account and notifications', [ex.status, ex.data.account.email, ex.data.notifications.length >= 2], [200, par.email, true]);
  check('the export never contains a password hash or token', /password|token_hash|hash/i.test(JSON.stringify(ex.data)), false);
  check('an unknown email is a 404, a malformed one a 400', [(await call('GET', '/admin/data/export?email=nobody@example.com', A)).status, (await call('GET', '/admin/data/export?email=nope', A)).status], [404, 400]);
  check('each export is audited', (await query("select count(*)::int n from audit_logs where action = 'data.person_exported' and entity_id = $1", [par.id])).rows[0].n, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
