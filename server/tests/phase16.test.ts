// Quizzes: building, publishing, taking (timer, attempts), automatic marking, privacy of answers.
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase16.test.ts   (API on :4000, fresh process)
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
const iso = (ahead: number) => new Date(Date.now() + ahead * 864e5).toISOString();
const Q = (text: string, marks: number, correct: number) => ({ text, marks, options: ['A', 'B', 'C'].map((t, i) => ({ text: `${text} ${t}`, isCorrect: i === correct })) });

(async () => {
  const { query } = await import('../src/db/pool');
  const A = (await call('POST', '/auth/login', undefined, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).data.accessToken as string;
  const tch = await newUser(A, 'teacher', { staffNumber: `QT-${sfx}` }); const tch2 = await newUser(A, 'teacher', { staffNumber: `QU-${sfx}` });
  const s1 = await newUser(A, 'student', { admissionNumber: `Q1-${sfx}` }); const s2 = await newUser(A, 'student', { admissionNumber: `Q2-${sfx}` }); const out = await newUser(A, 'student', { admissionNumber: `Q3-${sfx}` });
  const par = await newUser(A, 'parent');
  const y = 2100 + (parseInt(sfx, 36) % 800);
  const sess = (await call('POST', '/academic/sessions', A, { name: `${y}/${y + 1}`, startDate: '2100-01-01', endDate: '2100-12-31' })).data;
  await call('POST', `/academic/sessions/${sess.id}/set-current`, A);
  const tag = 'Q' + sfx.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const cls = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 1, arm: tag })).data; const cls2 = (await call('POST', '/academic/classes', A, { stage: 'JSS', year: 2, arm: tag })).data;
  const sub = (await call('POST', '/academic/subjects', A, { name: `QSub ${sfx}` })).data;
  for (const c of [cls, cls2]) await call('PUT', `/academic/classes/${c.id}/subjects`, A, { subjectIds: [sub.id] });
  await call('POST', '/academic/enrolments', A, { studentId: s1.id, classId: cls.id, sessionId: sess.id }); await call('POST', '/academic/enrolments', A, { studentId: s2.id, classId: cls.id, sessionId: sess.id });
  await call('POST', '/academic/enrolments', A, { studentId: out.id, classId: cls2.id, sessionId: sess.id });
  await call('POST', '/academic/teaching-assignments', A, { sessionId: sess.id, classId: cls.id, subjectId: sub.id, teacherId: tch.id });
  await call('POST', '/parent-links', A, { parentId: par.id, studentId: s1.id, relationship: 'mother' });

  check('roles are enforced', [(await call('GET', '/quizzes/teacher', s1.token)).status, (await call('GET', '/quizzes/student', tch.token)).status, (await call('GET', '/quizzes/parent', s1.token)).status, (await call('GET', '/quizzes/student')).status], [403, 403, 403, 401]);
  const body = { classId: cls.id, subjectId: sub.id, title: 'Week 1 quiz', instructions: 'Answer all', closesAt: iso(2), durationMinutes: 30, maxAttempts: 2, showAnswers: false, questions: [Q('One', 1, 0), Q('Two', 1, 1), Q('Three', 2, 2)] };
  check('a teacher cannot make a quiz for a class they do not teach', (await call('POST', '/quizzes/teacher', tch2.token, body)).status, 403);
  const created = await call('POST', '/quizzes/teacher', tch.token, body);
  check('a teacher creates a draft', created.status, 201);
  const qid = created.data.id as string;
  check('students cannot see a draft', (await call('GET', '/quizzes/student', s1.token)).data.length, 0);
  check('another teacher cannot open or edit it', [(await call('GET', `/quizzes/teacher/${qid}`, tch2.token)).status, (await call('PUT', `/quizzes/teacher/${qid}`, tch2.token, body)).status], [404, 404]);
  const noCorrect = await call('POST', '/quizzes/teacher', tch.token, { ...body, title: 'Bad', questions: [{ text: 'No answer', marks: 1, options: [{ text: 'x', isCorrect: false }, { text: 'y', isCorrect: false }] }] });
  check('a quiz with no correct answer cannot be published', (await call('POST', `/quizzes/teacher/${noCorrect.data.id}/publish`, tch.token, {})).status, 400);
  check('an empty quiz and a one-option question are refused when saving', [(await call('POST', '/quizzes/teacher', tch.token, { ...body, questions: [{ text: 'q', marks: 1, options: [{ text: 'only', isCorrect: true }] }] })).status], [400]);

  check('publishing notifies the enrolled students only', [(await call('POST', `/quizzes/teacher/${qid}/publish`, tch.token, {})).status,
    (await query("select count(*)::int n from notifications where entity_id = $1 and user_id = any($2)", [qid, [s1.id, s2.id]])).rows[0].n, (await query("select count(*)::int n from notifications where entity_id = $1 and user_id = $2", [qid, out.id])).rows[0].n], [200, 2, 0]);
  check('a published quiz cannot be edited', (await call('PUT', `/quizzes/teacher/${qid}`, tch.token, body)).status, 409);
  const det = (await call('GET', `/quizzes/teacher/${qid}`, tch.token)).data;
  const correct = (qi: number) => det.questions[qi].options.find((o: any) => o.isCorrect).id as string;
  const wrong = (qi: number) => det.questions[qi].options.find((o: any) => !o.isCorrect).id as string;

  // ---------- taking it ----------
  check('a student from another class cannot see or start it', [(await call('GET', '/quizzes/student', out.token)).data.length, (await call('POST', `/quizzes/student/${qid}/start`, out.token, {})).status], [0, 404]);
  const list = (await call('GET', '/quizzes/student', s1.token)).data;
  check('the class sees it as open, with no questions or answers in the list', [list.length, list[0].state, JSON.stringify(list).includes('isCorrect')], [1, 'open', false]);
  const st = await call('POST', `/quizzes/student/${qid}/start`, s1.token, {});
  const aid = st.data.attemptId as string;
  check('starting again resumes the same attempt', (await call('POST', `/quizzes/student/${qid}/start`, s1.token, {})).data.attemptId, aid);
  const att = (await call('GET', `/quizzes/attempts/${aid}`, s1.token)).data;
  check('the attempt has the questions but never the correct answers', [att.status, att.questions.length, JSON.stringify(att).includes('isCorrect'), JSON.stringify(att).includes('is_correct')], ['in_progress', 3, false, false]);
  check('the deadline is the time limit, not the closing date', Math.round((new Date(att.deadlineAt).getTime() - new Date(att.serverNow).getTime()) / 60000) <= 30, true);
  check('another student cannot open this attempt', (await call('GET', `/quizzes/attempts/${aid}`, s2.token)).status, 404);
  check('an option from a different question is refused', (await call('PUT', `/quizzes/attempts/${aid}/answers`, s1.token, { answers: [{ questionId: att.questions[0].id, optionId: correct(1) }] })).status, 400);
  await call('PUT', `/quizzes/attempts/${aid}/answers`, s1.token, { answers: [{ questionId: det.questions[0].id, optionId: correct(0) }, { questionId: det.questions[1].id, optionId: wrong(1) }] });
  const resumed = (await call('GET', `/quizzes/attempts/${aid}`, s1.token)).data;
  check('saved answers come back when resuming', resumed.questions.filter((q: any) => q.chosenOptionId).length, 2);
  const sub1 = await call('POST', `/quizzes/attempts/${aid}/submit`, s1.token, { answers: [{ questionId: det.questions[2].id, optionId: correct(2) }] });
  check('submitting marks it: 1 + 0 + 2 = 3 of 4, and answers stay hidden', [sub1.data.status, sub1.data.score, sub1.data.maxScore, sub1.data.review], ['submitted', 3, 4, null]);
  check('submitting twice is harmless and changes nothing', (await call('POST', `/quizzes/attempts/${aid}/submit`, s1.token, { answers: [{ questionId: det.questions[1].id, optionId: correct(1) }] })).data.score, 3);
  check('answers cannot be changed after submitting', (await call('PUT', `/quizzes/attempts/${aid}/answers`, s1.token, { answers: [{ questionId: det.questions[1].id, optionId: correct(1) }] })).status, 409);

  // ---------- attempts ----------
  const a2 = await call('POST', `/quizzes/student/${qid}/start`, s1.token, {});
  check('a second attempt is allowed; the best score is kept in the list', [a2.status, (await call('GET', '/quizzes/student', s1.token)).data[0].best], [201, 3]);
  await call('PUT', `/quizzes/attempts/${a2.data.attemptId}/answers`, s1.token, { answers: [0, 1, 2].map((i) => ({ questionId: det.questions[i].id, optionId: correct(i) })) });
  check('the second attempt scores 4 of 4', (await call('POST', `/quizzes/attempts/${a2.data.attemptId}/submit`, s1.token, {})).data.score, 4);
  check('a third attempt is refused', (await call('POST', `/quizzes/student/${qid}/start`, s1.token, {})).error?.code, 'NO_ATTEMPTS_LEFT');

  // ---------- timer ----------
  const t2 = await call('POST', `/quizzes/student/${qid}/start`, s2.token, {});
  await call('PUT', `/quizzes/attempts/${t2.data.attemptId}/answers`, s2.token, { answers: [{ questionId: det.questions[0].id, optionId: correct(0) }] });
  await query("update quiz_attempts set deadline_at = now() - interval '1 minute' where id = $1", [t2.data.attemptId]);
  check('after the deadline, saving is refused and the attempt is submitted with what was saved', [(await call('PUT', `/quizzes/attempts/${t2.data.attemptId}/answers`, s2.token, { answers: [{ questionId: det.questions[1].id, optionId: correct(1) }] })).error?.code,
    (await call('GET', `/quizzes/attempts/${t2.data.attemptId}`, s2.token)).data.score], ['TIME_UP', 1]);
  const r2 = (await call('GET', `/quizzes/attempts/${t2.data.attemptId}`, s2.token)).data;
  check('and it is flagged as auto-submitted', r2.autoSubmitted, true);

  // ---------- parents and teachers see results ----------
  const pr = (await call('GET', '/quizzes/parent', par.token)).data;
  check('the parent sees their child’s best score', [pr.length, pr[0].quizzes[0].best, pr[0].quizzes[0].maxScore], [1, 4, 4]);
  check('the teacher sees both students’ best scores and an average', [(await call('GET', `/quizzes/teacher/${qid}`, tch.token)).data.results.map((r: any) => r.best).sort(), (await call('GET', '/quizzes/teacher', tch.token)).data[0].takers], [[1, 4], 2]);

  // ---------- closing ----------
  const open = await call('POST', '/quizzes/teacher', tch.token, { ...body, title: 'Closing quiz' }); await call('POST', `/quizzes/teacher/${open.data.id}/publish`, tch.token, {});
  const mid = await call('POST', `/quizzes/student/${open.data.id}/start`, s1.token, {});
  check('closing a quiz submits anyone still taking it', [(await call('POST', `/quizzes/teacher/${open.data.id}/close`, tch.token, {})).status, (await call('GET', `/quizzes/attempts/${mid.data.attemptId}`, s1.token)).data.status], [200, 'submitted']);
  check('nobody can start a closed quiz', (await call('POST', `/quizzes/student/${open.data.id}/start`, s2.token, {})).status, 404);
  const late = await call('POST', '/quizzes/teacher', tch.token, { ...body, title: 'Late quiz' }); await call('POST', `/quizzes/teacher/${late.data.id}/publish`, tch.token, {});
  await query("update quizzes set closes_at = now() - interval '1 minute' where id = $1", [late.data.id]);
  check('after the closing time a published quiz cannot be started', (await call('POST', `/quizzes/student/${late.data.id}/start`, s2.token, {})).error?.code, 'CLOSED');
  check('a draft can be deleted, a published quiz cannot', [(await call('DELETE', `/quizzes/teacher/${noCorrect.data.id}`, tch.token)).status, (await call('DELETE', `/quizzes/teacher/${qid}`, tch.token)).status], [200, 409]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
