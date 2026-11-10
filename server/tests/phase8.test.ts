// Timetables, exam schedules and session rollover. API on :4000 (fresh process), migrated DB, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase8.test.ts
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
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: day(-60), endDate: day(300) })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const term = (await call('POST', '/academic/terms', A, { sessionId: sess.id, termNumber: 1, startDate: day(-40), endDate: day(60) })).data;
  const tag = 'T' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const mk = async (stage: string, year: number, arm: string | null) => (await call('POST', '/academic/classes', A, { stage, year, arm })).data;
  const c1 = await mk('JSS', 1, tag); const c2 = await mk('JSS', 2, tag); const c3 = await mk('JSS', 3, tag); const s3 = await mk('SSS', 3, tag);
  const maths = (await call('POST', '/academic/subjects', A, { name: `Maths ${sfx}` })).data; const eng = (await call('POST', '/academic/subjects', A, { name: `English ${sfx}` })).data;
  for (const c of [c1, c2, c3, s3]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [maths.id, eng.id] });
  const tA = await newUser(A, 'teacher', { staffNumber: `TA-${sfx}` }); const tB = await newUser(A, 'teacher', { staffNumber: `TB-${sfx}` });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: maths.id, teacherId: tA.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c2.id, subjectId: maths.id, teacherId: tA.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c1.id, subjectId: eng.id, teacherId: tB.id });
  const stu1 = await newUser(A, 'student', { admissionNumber: `S1-${sfx}` }); const stu2 = await newUser(A, 'student', { admissionNumber: `S2-${sfx}` });
  const stu3 = await newUser(A, 'student', { admissionNumber: `S3-${sfx}` }); const stu4 = await newUser(A, 'student', { admissionNumber: `S4-${sfx}` });
  const stuG = await newUser(A, 'student', { admissionNumber: `SG-${sfx}` });
  const enrol = (s: any, c: any) => call('POST', '/academic/enrolments', A, { studentId: s.id, classId: c.id, sessionId: sess.id });
  await enrol(stu1, c1); await enrol(stu2, c1); await enrol(stu3, c2); await enrol(stu4, c3); await enrol(stuG, s3);
  const par = await newUser(A, 'parent'); const par2 = await newUser(A, 'parent');
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: stu1.id, relationship: 'mother' });
  await call('POST', '/parent-links', A, { parentId: par2.id, studentId: stu3.id, relationship: 'father' });

  // ---------- timetable ----------
  const slot = (o: any) => call('POST', '/timetable', A, { sessionId: sess.id, classId: c1.id, subjectId: maths.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:40', ...o });
  check('only the administrator changes the timetable', [(await call('POST', '/timetable', tA.token, { sessionId: sess.id, classId: c1.id, subjectId: maths.id, dayOfWeek: 1, startTime: '08:00', endTime: '08:40' })).status, (await call('POST', '/timetable', stu1.token, {})).status], [403, 403]);
  const s1 = await slot({});
  check('slot created with its teacher taken from the teaching assignment', [s1.status, s1.data.teachers.length, s1.data.dayName], [201, 1, 'Monday']);
  check('end time before start time is refused', (await slot({ startTime: '09:00', endTime: '08:30', dayOfWeek: 2 })).status, 400);
  check('weekend days are refused', (await slot({ dayOfWeek: 6 })).status, 400);
  check('bad time format is refused', (await slot({ startTime: '8am' })).status, 400);
  const overlap = await slot({ subjectId: eng.id, startTime: '08:30', endTime: '09:10' });
  check('overlapping lesson for the same class is refused', [overlap.status, overlap.error?.code], [409, 'CLASS_CLASH']);
  const back = await slot({ subjectId: eng.id, startTime: '08:40', endTime: '09:20' });
  check('back to back lessons are allowed', back.status, 201);
  const clash = await slot({ classId: c2.id, startTime: '08:20', endTime: '09:00' });
  check('a teacher cannot be in two classes at once', [clash.status, clash.error?.code], [409, 'TEACHER_CLASH']);
  const fine = await slot({ classId: c2.id, startTime: '09:20', endTime: '10:00' });
  check('same teacher at a free time is fine', fine.status, 201);
  const moved = await call('PATCH', `/timetable/${fine.data.id}`, A, { startTime: '08:30', endTime: '09:10' });
  check('moving a slot onto a teacher clash is refused', [moved.status, moved.error?.code], [409, 'TEACHER_CLASH']);
  check('moving a slot to a free time works', (await call('PATCH', `/timetable/${fine.data.id}`, A, { startTime: '10:00', endTime: '10:40', room: 'Room 4' })).data.room, 'Room 4');
  const outside = await call('POST', '/timetable', A, { sessionId: sess.id, classId: c1.id, subjectId: (await call('POST', '/academic/subjects', A, { name: `Art ${sfx}` })).data.id, dayOfWeek: 3, startTime: '08:00', endTime: '08:40' });
  check('a subject the class does not take cannot be scheduled', [outside.status, outside.error?.code], [400, 'SUBJECT_NOT_IN_CLASS']);
  const removeSubj = await call('PUT', `/academic/classes/${c1.id}/subjects`, A, { subjectIds: [maths.id] });
  check('removing a subject still on the timetable is refused', removeSubj.status, 409);
  const listed = await call('GET', `/timetable?sessionId=${sess.id}&classId=${c1.id}`, A);
  check('class timetable lists only that class, in time order', [listed.data.length, listed.data.map((e: any) => e.startTime)], [2, ['08:00', '08:40']]);
  check('timetable can be filtered by teacher', (await call('GET', `/timetable?sessionId=${sess.id}&teacherId=${tA.id}`, A)).data.length, 2);

  // ---------- timetable views ----------
  const sv = await call('GET', '/students/me/timetable', stu1.token);
  check('student sees their own class timetable', [sv.status, sv.data.entries.length, sv.data.className], [200, 2, `JSS 1${tag}`]);
  check('another class student sees theirs, not the first', (await call('GET', '/students/me/timetable', stu3.token)).data.entries.map((e: any) => e.startTime), ['10:00']);
  check('parent sees a linked child timetable', (await call('GET', `/parents/me/children/${stu1.id}/timetable`, par.token)).data.entries.length, 2);
  check("parent cannot see another family's child", (await call('GET', `/parents/me/children/${stu1.id}/timetable`, par2.token)).status, 404);
  check('teacher sees only lessons they teach', (await call('GET', '/teachers/me/timetable', tA.token)).data.entries.length, 2);
  check('other teacher sees only their own', (await call('GET', '/teachers/me/timetable', tB.token)).data.entries.length, 1);
  check('students cannot read the admin timetable endpoint', (await call('GET', `/timetable?sessionId=${sess.id}`, stu1.token)).status, 403);
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: c2.id, subjectId: eng.id, teacherId: tA.id });
  check('conflicts list is empty when there are none', (await call('GET', `/timetable/conflicts?sessionId=${sess.id}`, A)).data.length, 0);
  check('slot can be deleted', (await call('DELETE', `/timetable/${back.data.id}`, A)).status, 200);

  // ---------- exam schedules ----------
  const ex = await call('POST', '/exam-schedules', A, { termId: term.id, title: 'First term examinations' });
  check('exam schedule starts as a draft', [ex.status, ex.data.isPublished], [201, false]);
  const paper = (o: any) => call('POST', `/exam-schedules/${ex.data.id}/papers`, A, { classId: c1.id, subjectId: maths.id, date: day(10), startTime: '09:00', endTime: '11:00', venue: 'Hall', ...o });
  check('publishing an empty schedule is refused', (await call('POST', `/exam-schedules/${ex.data.id}/publish`, A)).status, 400);
  const p1 = await paper({});
  check('paper added', p1.status, 201);
  check('exam date outside the term is refused', (await paper({ subjectId: eng.id, date: day(90) })).error?.code, 'OUTSIDE_TERM');
  check('second paper for same class and subject is refused', (await paper({ date: day(11) })).error?.code, 'DUPLICATE');
  check('overlapping paper for the class that day is refused', (await paper({ subjectId: eng.id, startTime: '10:00', endTime: '12:00' })).error?.code, 'CLASS_CLASH');
  const p2 = await paper({ subjectId: eng.id, startTime: '11:30', endTime: '13:00' });
  check('a later paper the same day is fine', p2.status, 201);
  const p3 = await paper({ classId: c2.id, subjectId: maths.id, date: day(12) });
  check('draft schedules are invisible to students, parents and teachers', [(await call('GET', '/students/me/exams', stu1.token)).data.length, (await call('GET', `/parents/me/children/${stu1.id}/exams`, par.token)).data.length, (await call('GET', '/teachers/me/exams', tA.token)).data.length], [0, 0, 0]);
  check('students cannot create papers', (await call('POST', `/exam-schedules/${ex.data.id}/papers`, stu1.token, {})).status, 403);
  const pub = await call('POST', `/exam-schedules/${ex.data.id}/publish`, A);
  check('schedule published', pub.data.isPublished, true);
  const sx = await call('GET', '/students/me/exams', stu1.token);
  check('student sees only their class papers, in date order', [sx.data.length, sx.data.map((e: any) => e.subjectName.split(' ')[0])], [2, ['Maths', 'English']]);
  check('student in another class sees only theirs', (await call('GET', '/students/me/exams', stu3.token)).data.length, 1);
  check('a class with no papers sees none', (await call('GET', '/students/me/exams', stu4.token)).data.length, 0);
  check('parent sees linked child papers', (await call('GET', `/parents/me/children/${stu1.id}/exams`, par.token)).data.length, 2);
  check("parent cannot read another family's child papers", (await call('GET', `/parents/me/children/${stu1.id}/exams`, par2.token)).status, 404);
  check('teacher sees papers for what they teach', (await call('GET', '/teachers/me/exams', tA.token)).data.length, 2);
  check('the English teacher sees only English', (await call('GET', '/teachers/me/exams', tB.token)).data.map((e: any) => e.subjectName.split(' ')[0]), ['English']);
  const notes = async (id: string) => (await query("select type, link from notifications where user_id = $1 and type like 'exam_%' order by created_at", [id])).rows;
  check('publishing told the student, parent and teacher once each', [(await notes(stu1.id)).length, (await notes(par.id)).length, (await notes(tA.id)).length], [1, 1, 1]);
  check('notifications link to the right portal', [(await notes(stu1.id))[0].link, (await notes(par.id))[0].link, (await notes(tA.id))[0].link], ['/student/exams', '/parent/exams', '/teacher/exams']);
  await call('POST', `/exam-schedules/${ex.data.id}/unpublish`, A);
  check('unpublishing hides it again', (await call('GET', '/students/me/exams', stu1.token)).data.length, 0);
  await call('POST', `/exam-schedules/${ex.data.id}/publish`, A);
  check('republishing never notifies twice', (await notes(stu1.id)).length, 1);
  check('a published schedule cannot be deleted', (await call('DELETE', `/exam-schedules/${ex.data.id}`, A)).error?.code, 'PUBLISHED');
  await call('PATCH', `/exam-papers/${p1.data.id}`, A, { date: day(13) });
  const after = await notes(stu1.id);
  check('moving a published paper notifies the class', [after.length, after[1].type], [2, 'exam_changed']);
  await call('PATCH', `/exam-papers/${p1.data.id}`, A, { instructions: 'Bring a calculator' });
  check('changing only the instructions does not notify', (await notes(stu1.id)).length, 2);
  await call('DELETE', `/exam-papers/${p2.data.id}`, A);
  check('removing a published paper notifies the class', (await notes(stu1.id)).at(-1)!.type, 'exam_removed');
  check('upcoming scope hides past papers', (await call('GET', '/students/me/exams?scope=upcoming', stu1.token)).data.every((e: any) => e.date >= day(0)), true);
  check('bad scope is refused', (await call('GET', '/students/me/exams?scope=never', stu1.token)).status, 400);

  // ---------- rollover ----------
  const ns = (await call('POST', '/academic/sessions', A, { name: `${y + 1}/${y + 2}`, startDate: day(310), endDate: day(660) })).data;
  await call('PUT', '/attendance/form-teachers', A, { classId: c1.id, sessionId: sess.id, teacherId: tA.id });
  const base = { fromSessionId: sess.id, toSessionId: ns.id };
  check('only the administrator can preview a promotion', (await call('POST', '/rollover/preview', tA.token, base)).status, 403);
  check('promoting into an earlier session is refused', (await call('POST', '/rollover/preview', A, { fromSessionId: ns.id, toSessionId: sess.id })).status, 400);
  const pv = await call('POST', '/rollover/preview', A, { ...base, createMissingClasses: false });
  const byName = (d: any, n: string) => d.classes.find((c: any) => c.fromClassName === n);
  check('JSS 3 is blocked while SSS 1 does not exist', [pv.data.canRun, pv.data.blockers.length], [false, 1]);
  check('JSS 1 goes to JSS 2, SSS 3 graduates', [byName(pv.data, `JSS 1${tag}`).target.className, byName(pv.data, `SSS 3${tag}`).target.graduate], [`JSS 2${tag}`, true]);
  check('refusing to run while blocked', (await call('POST', '/rollover/run', A, base)).status, 409);
  const withCreate = await call('POST', '/rollover/preview', A, { ...base, createMissingClasses: true });
  check('missing classes can be created', [withCreate.data.canRun, withCreate.data.classesToCreate], [true, [`SSS 1${tag}`]]);
  check('preview changes nothing', (await query('select count(*)::int n from enrolments where session_id = $1', [ns.id])).rows[0].n, 0);
  const run = await call('POST', '/rollover/run', A, { ...base, createMissingClasses: true, repeatStudentIds: [stu2.id], excludeStudentIds: [stu4.id], carryTimetable: true });
  check('promotion ran', [run.status, run.data.promoted, run.data.repeated, run.data.graduated, run.data.excluded], [200, 2, 1, 1, 1]);
  const cls = async (id: string) => (await call('GET', `/academic/enrolments?sessionId=${ns.id}`, A)).data.find((e: any) => e.studentId === id)?.className;
  check('promoted, repeating, excluded and graduated students end up right', [await cls(stu1.id), await cls(stu2.id), await cls(stu3.id), await cls(stu4.id), await cls(stuG.id)], [`JSS 2${tag}`, `JSS 1${tag}`, `JSS 3${tag}`, undefined, undefined]);
  check('final year is marked graduated in the old session', (await call('GET', `/academic/enrolments?sessionId=${sess.id}`, A)).data.find((e: any) => e.studentId === stuG.id).status, 'graduated');
  check('old session history is otherwise untouched', (await call('GET', `/academic/enrolments?sessionId=${sess.id}`, A)).data.find((e: any) => e.studentId === stu1.id).className, `JSS 1${tag}`);
  check('form teacher and teaching assignments carried over', [run.data.formTeachersCarried, run.data.assignmentsCarried >= 4], [1, true]);
  check('timetable carried over', run.data.timetableSlotsCarried > 0, true);
  check('running it twice is refused', (await call('POST', '/rollover/run', A, { ...base, createMissingClasses: true })).error?.code, 'ALREADY_DONE');
  check('preview then reports it as already done', (await call('POST', '/rollover/preview', A, base)).data.alreadyDone, true);
  const audited = (await query("select count(*)::int n from audit_logs where action = 'session.rollover' and entity_id = $1", [ns.id])).rows[0].n;
  check('the promotion is in the audit log', audited, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
