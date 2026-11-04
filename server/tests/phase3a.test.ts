// API running on :4000, migrated DB, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase3a.test.ts
import { parseYouTubeId } from '../src/utils/youtube';

const B = 'http://localhost:4000/api';
const sfx = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(B + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function upload(token: string | undefined, name: string, bytes: Buffer, purpose = '') {
  const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(bytes)]), name);
  const res = await fetch(B + '/files' + (purpose ? `?purpose=${purpose}` : ''), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data };
}
async function download(token: string | undefined, id: string) {
  const res = await fetch(`${B}/files/${id}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
function check(name: string, got: unknown, want: unknown) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${okk ? 'PASS' : 'FAIL'}  ${name}${okk ? '' : `  (expected ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`);
  okk ? pass++ : fail++;
}
const PW = 'Sup3rSecret99';
async function newUser(adminT: string, role: string, extra: Record<string, string> = {}) {
  const email = `${role}.${sfx}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await call('POST', '/users', adminT, { email, role, firstName: role, lastName: sfx, ...extra });
  await call('POST', '/auth/activate', undefined, { token: r.data.activationLink.split('token=')[1], password: PW });
  const l = await call('POST', '/auth/login', undefined, { email, password: PW });
  return { id: r.data.user.id as string, token: l.data.accessToken as string };
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')]);
const XLSX_AS_DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....xl/workbook.xml....')]);

(async () => {
  // ---- YouTube link parsing (pure) ----
  const ID = 'dQw4w9WgXcQ';
  for (const [label, url] of [
    ['watch', `https://www.youtube.com/watch?v=${ID}&t=42s`], ['short link', `https://youtu.be/${ID}?si=abc`], ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://youtube.com/shorts/${ID}`], ['mobile', `https://m.youtube.com/watch?v=${ID}`], ['nocookie', `https://www.youtube-nocookie.com/embed/${ID}`],
  ]) check(`parse ${label}`, parseYouTubeId(url), ID);
  for (const [label, url] of [
    ['playlist only', 'https://www.youtube.com/playlist?list=PL12345678901'], ['other site', `https://vimeo.com/watch?v=${ID}`], ['look-alike host', `https://youtube.com.evil.io/watch?v=${ID}`],
    ['javascript url', `javascript:alert(1)//youtube.com/watch?v=${ID}`], ['short id', 'https://youtu.be/abc'], ['id with junk', 'https://youtu.be/dQw4w9WgXc"><x'], ['not a url', 'hello'],
  ]) check(`reject ${label}`, parseYouTubeId(url), null);

  // ---- setup ----
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2026-09-01', endDate: '2027-07-30' });
  await call('POST', `/academic/sessions/${sess.data.id}/set-current`, A);
  const tag = 'L' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const c1 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data;
  const c2 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const math = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data;
  const bio = (await call('POST', '/academic/subjects', A, { name: `Biology ${sfx}` })).data;
  for (const c of [c1, c2]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [math.id, bio.id] });
  const tA = await newUser(A, 'teacher', { staffNumber: `TA-${sfx}` });
  const tB = await newUser(A, 'teacher', { staffNumber: `TB-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `L1-${sfx}` });
  const s2 = await newUser(A, 'student', { admissionNumber: `L2-${sfx}` });
  const s3 = await newUser(A, 'student', { admissionNumber: `L3-${sfx}` }); // never enrolled
  await call('POST', '/academic/enrolments', A, { studentId: s1.id, classId: c1.id, sessionId: sess.data.id });
  await call('POST', '/academic/enrolments', A, { studentId: s2.id, classId: c2.id, sessionId: sess.data.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.data.id, classId: c1.id, subjectId: math.id, teacherId: tA.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.data.id, classId: c1.id, subjectId: bio.id, teacherId: tB.id });

  // ---- uploads ----
  check('upload needs sign-in', (await upload(undefined, 'a.pdf', PDF)).status, 401);
  check('student cannot upload teaching resources', (await upload(s1.token, 'a.pdf', PDF, 'resource')).status, 403);
  const pdf = await upload(tA.token, 'Algebra notes.pdf', PDF);
  check('teacher uploads a pdf', [pdf.status, pdf.data.name, pdf.data.mimeType], [201, 'Algebra notes.pdf', 'application/pdf']);
  check('png accepted', (await upload(tA.token, 'diagram.PNG', PNG)).status, 201);
  check('docx accepted', (await upload(tA.token, 'work.docx', DOCX)).status, 201);
  check('.exe rejected', (await upload(tA.token, 'virus.exe', Buffer.from('MZ....'))).status, 400);
  check('.html rejected', (await upload(tA.token, 'page.html', Buffer.from('<script>alert(1)</script>'))).status, 400);
  check('png bytes renamed .pdf rejected', (await upload(tA.token, 'fake.pdf', PNG)).status, 400);
  check('spreadsheet renamed .docx rejected', (await upload(tA.token, 'sheet.docx', XLSX_AS_DOCX)).status, 400);
  check('no extension rejected', (await upload(tA.token, 'README', PDF)).status, 400);
  check('empty file rejected', (await upload(tA.token, 'empty.pdf', Buffer.alloc(0))).status, 400);
  check('file over 10 MB -> 413', (await upload(tA.token, 'big.pdf', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]))).status, 413);

  // ---- lesson notes ----
  const note = { classId: c1.id, subjectId: math.id, title: 'Quadratic equations', topic: 'Algebra', body: 'Read pages 10-14.', fileIds: [pdf.data.id] };
  check('teacher not assigned to that class/subject -> 403', (await call('POST', '/lesson-notes', tA.token, { ...note, subjectId: bio.id, fileIds: [] })).status, 403);
  check('teacher not assigned to that class -> 403', (await call('POST', '/lesson-notes', tA.token, { ...note, classId: c2.id, fileIds: [] })).status, 403);
  check("cannot attach another teacher's file -> 400", (await call('POST', '/lesson-notes', tB.token, { ...note, subjectId: bio.id })).status, 400);
  const n = await call('POST', '/lesson-notes', tA.token, note);
  check('create draft note', [n.status, n.data.status, n.data.files.length], [201, 'draft', 1]);
  check('student cannot create notes -> 403', (await call('POST', '/lesson-notes', s1.token, note)).status, 403);
  check('student does not see drafts in feed', (await call('GET', '/students/me/learning', s1.token)).data.notes.length, 0);
  check('student cannot open a draft by id', (await call('GET', `/lesson-notes/${n.data.id}`, s1.token)).status, 404);
  check('student cannot download a draft attachment', (await download(s1.token, pdf.data.id)).status, 404);
  check('owner can download own file', (await download(tA.token, pdf.data.id)).body.equals(PDF), true);
  check('other teacher cannot edit my note', (await call('PATCH', `/lesson-notes/${n.data.id}`, tB.token, { title: 'x' })).status, 404);
  check('other teacher cannot download my file', (await download(tB.token, pdf.data.id)).status, 404);

  check('publish', (await call('PATCH', `/lesson-notes/${n.data.id}`, tA.token, { status: 'published' })).data.status, 'published');
  const feed = (await call('GET', '/students/me/learning', s1.token)).data;
  check('class student sees the published note', feed.notes.map((x: any) => x.title), ['Quadratic equations']);
  check('student reads note body + file list', ((d) => [d.body, d.files[0].name])((await call('GET', `/lesson-notes/${n.data.id}`, s1.token)).data), ['Read pages 10-14.', 'Algebra notes.pdf']);
  const dl = await download(s1.token, pdf.data.id);
  check('class student downloads attachment', [dl.status, dl.body.equals(PDF)], [200, true]);
  check('download is an attachment, not rendered inline', (dl.headers.get('content-disposition') ?? '').startsWith('attachment'), true);
  check('download is not cached', dl.headers.get('cache-control'), 'private, no-store');
  check('other class student cannot see it', (await call('GET', '/students/me/learning', s2.token)).data.notes.length, 0);
  check('other class student cannot open it', (await call('GET', `/lesson-notes/${n.data.id}`, s2.token)).status, 404);
  check('other class student cannot download', (await download(s2.token, pdf.data.id)).status, 404);
  check('unenrolled student sees nothing', (await call('GET', '/students/me/learning', s3.token)).data.notes.length, 0);
  check('anonymous cannot download', (await download(undefined, pdf.data.id)).status, 401);
  check('admin can download', (await download(A, pdf.data.id)).status, 200);
  check('search by topic', (await call('GET', '/students/me/learning?q=algeb', s1.token)).data.notes.length, 1);
  check('search with no match', (await call('GET', '/students/me/learning?q=zzzz', s1.token)).data.notes.length, 0);
  check('filter by other subject', (await call('GET', `/students/me/learning?subjectId=${bio.id}`, s1.token)).data.notes.length, 0);

  check('archive hides it again', (await call('PATCH', `/lesson-notes/${n.data.id}`, tA.token, { status: 'archived' })).data.status, 'archived');
  check('archived note gone from feed', (await call('GET', '/students/me/learning', s1.token)).data.notes.length, 0);
  check('student loses file access when archived', (await download(s1.token, pdf.data.id)).status, 404);
  const mine = (await call('GET', '/lesson-notes?status=archived', tA.token)).data as any[];
  check('teacher still lists archived notes', mine.some((x) => x.id === n.data.id), true);
  const swap = await upload(tA.token, 'v2.pdf', PDF);
  const upd = await call('PATCH', `/lesson-notes/${n.data.id}`, tA.token, { fileIds: [swap.data.id] });
  check('replacing attachments', upd.data.files.map((f: any) => f.name), ['v2.pdf']);
  check('removed attachment is deleted for good', (await download(tA.token, pdf.data.id)).status, 404);

  // ---- video lessons ----
  const vid = { classId: c1.id, subjectId: math.id, title: 'Solving by factoring', topic: 'Algebra', description: 'Worked examples', instructions: 'Watch, then do Q1-5', url: 'https://youtu.be/dQw4w9WgXcQ?si=zzz' };
  check('bad link -> 400', (await call('POST', '/video-lessons', tA.token, { ...vid, url: 'https://example.com/video' })).status, 400);
  check('video for unassigned subject -> 403', (await call('POST', '/video-lessons', tA.token, { ...vid, subjectId: bio.id })).status, 403);
  const vd = await call('POST', '/video-lessons', tA.token, vid);
  check('video stores only the id; embed uses the official format', [vd.status, vd.data.youtubeId, vd.data.embedUrl], [201, 'dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']);
  check('draft video hidden from students', (await call('GET', '/students/me/learning', s1.token)).data.videos.length, 0);
  check('student cannot open draft video', (await call('GET', `/video-lessons/${vd.data.id}`, s1.token)).status, 404);
  await call('PATCH', `/video-lessons/${vd.data.id}`, tA.token, { status: 'published' });
  const vf = (await call('GET', '/students/me/learning', s1.token)).data.videos;
  check('published video visible to the class', [vf.length, vf[0]?.instructions], [1, 'Watch, then do Q1-5']);
  check('other class does not see it', (await call('GET', '/students/me/learning', s2.token)).data.videos.length, 0);
  check('other teacher cannot edit it', (await call('PATCH', `/video-lessons/${vd.data.id}`, tB.token, { title: 'x' })).status, 404);
  check('edit title + link', ((d) => [d.title, d.youtubeId])((await call('PATCH', `/video-lessons/${vd.data.id}`, tA.token, { title: 'Factoring', url: 'https://www.youtube.com/watch?v=9bZkp7q19f0' })).data), ['Factoring', '9bZkp7q19f0']);
  check('unpublish hides it', ((await call('PATCH', `/video-lessons/${vd.data.id}`, tA.token, { status: 'draft' })), (await call('GET', '/students/me/learning', s1.token)).data.videos.length), 0);
  check('other teacher cannot delete it', (await call('DELETE', `/video-lessons/${vd.data.id}`, tB.token)).status, 404);
  check('delete', (await call('DELETE', `/video-lessons/${vd.data.id}`, tA.token)).status, 200);
  check('deleted video is gone', (await call('GET', `/video-lessons/${vd.data.id}`, tA.token)).status, 404);

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
