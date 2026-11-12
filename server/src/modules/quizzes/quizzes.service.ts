import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const notFound = () => new AppError(404, 'Quiz not found', 'NOT_FOUND');

export interface QuestionInput { text: string; marks: number; options: { text: string; isCorrect: boolean }[] }
export interface QuizInput {
  classId: string; subjectId: string; title: string; instructions: string; opensAt?: string | null; closesAt: string;
  durationMinutes?: number | null; maxAttempts: number; showAnswers: boolean; questions: QuestionInput[];
}

// ================= Teacher =================
export async function teacherOptions(teacherId: string) {
  const { rows } = await query(
    `select ta.class_id, ta.subject_id, ${CLASS_NAME} as class_name, sb.name as subject_name
       from teaching_assignments ta join academic_sessions s on s.id = ta.session_id and s.is_current
       join classes c on c.id = ta.class_id join subjects sb on sb.id = ta.subject_id where ta.teacher_id = $1 order by class_name, subject_name`, [teacherId]);
  return rows.map((r) => ({ classId: r.class_id, className: r.class_name, subjectId: r.subject_id, subjectName: r.subject_name }));
}
async function currentSessionId(): Promise<string> {
  const s = (await query('select id from academic_sessions where is_current')).rows[0];
  if (!s) throw new AppError(409, 'No academic session is current.', 'NO_SESSION');
  return s.id;
}
async function assertTeaches(teacherId: string, classId: string, subjectId: string, sessionId: string) {
  const ok = (await query('select 1 from teaching_assignments where teacher_id = $1 and class_id = $2 and subject_id = $3 and session_id = $4', [teacherId, classId, subjectId, sessionId])).rowCount;
  if (!ok) throw new AppError(403, 'You do not teach this subject to this class.', 'FORBIDDEN');
}
async function ownedQuiz(teacherId: string, id: string) {
  const q = (await query('select * from quizzes where id = $1 and teacher_id = $2', [id, teacherId])).rows[0];
  if (!q) throw notFound();
  return q;
}
async function writeQuestions(c: { query: typeof query }, quizId: string, questions: QuestionInput[]) {
  await c.query('delete from quiz_questions where quiz_id = $1', [quizId]);
  for (const [qi, q] of questions.entries()) {
    const qr = await c.query('insert into quiz_questions (quiz_id, position, body, marks) values ($1,$2,$3,$4) returning id', [quizId, qi + 1, q.text, q.marks]);
    // At most one correct option is stored; a draft with none marked is allowed and is caught at publish.
    let usedCorrect = false;
    for (const [oi, o] of q.options.entries()) {
      const correct = o.isCorrect && !usedCorrect; usedCorrect = usedCorrect || correct;
      await c.query('insert into quiz_options (question_id, position, body, is_correct) values ($1,$2,$3,$4)', [qr.rows[0].id, oi + 1, o.text, correct]);
    }
  }
}

export async function createQuiz(teacherId: string, i: QuizInput, ip?: string) {
  const sessionId = await currentSessionId();
  await assertTeaches(teacherId, i.classId, i.subjectId, sessionId);
  const id = await withTransaction(async (c) => {
    const r = await c.query(
      `insert into quizzes (teacher_id, session_id, class_id, subject_id, title, instructions, opens_at, closes_at, duration_minutes, max_attempts, show_answers)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [teacherId, sessionId, i.classId, i.subjectId, i.title, i.instructions, i.opensAt ?? null, i.closesAt, i.durationMinutes ?? null, i.maxAttempts, i.showAnswers]);
    await writeQuestions(c, r.rows[0].id, i.questions);
    await audit({ actorId: teacherId, action: 'quiz.created', entityType: 'quiz', entityId: r.rows[0].id, ip }, c);
    return r.rows[0].id as string;
  });
  return { id };
}

export async function updateQuiz(teacherId: string, id: string, i: QuizInput, ip?: string) {
  const q = await ownedQuiz(teacherId, id);
  if (q.status !== 'draft') throw new AppError(409, 'Only a draft quiz can be edited. Close it and make a copy instead.', 'NOT_DRAFT');
  await assertTeaches(teacherId, i.classId, i.subjectId, q.session_id);
  await withTransaction(async (c) => {
    await c.query(
      `update quizzes set class_id=$2, subject_id=$3, title=$4, instructions=$5, opens_at=$6, closes_at=$7, duration_minutes=$8, max_attempts=$9, show_answers=$10, updated_at=now() where id=$1`,
      [id, i.classId, i.subjectId, i.title, i.instructions, i.opensAt ?? null, i.closesAt, i.durationMinutes ?? null, i.maxAttempts, i.showAnswers]);
    await writeQuestions(c, id, i.questions);
    await audit({ actorId: teacherId, action: 'quiz.updated', entityType: 'quiz', entityId: id, ip }, c);
  });
  return { id };
}

export async function deleteDraft(teacherId: string, id: string, ip?: string) {
  const q = await ownedQuiz(teacherId, id);
  if (q.status !== 'draft') throw new AppError(409, 'Only a draft can be deleted.', 'NOT_DRAFT');
  await query('delete from quizzes where id = $1', [id]);
  await audit({ actorId: teacherId, action: 'quiz.deleted', entityType: 'quiz', entityId: id, ip });
  return { deleted: true };
}

export async function teacherList(teacherId: string) {
  const { rows } = await query(
    `select q.id, q.title, q.status, q.closes_at, q.opens_at, ${CLASS_NAME} as class_name, sb.name as subject,
            (select count(*)::int from quiz_questions x where x.quiz_id = q.id) as questions,
            (select count(distinct a.student_id)::int from quiz_attempts a where a.quiz_id = q.id and a.status = 'submitted') as takers,
            (select round(avg(a.score / nullif(a.max_score, 0) * 100)::numeric, 1)::float8 from quiz_attempts a where a.quiz_id = q.id and a.status = 'submitted') as average_percent
       from quizzes q join classes c on c.id = q.class_id join subjects sb on sb.id = q.subject_id
      where q.teacher_id = $1 order by q.created_at desc`, [teacherId]);
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, className: r.class_name, subject: r.subject, closesAt: r.closes_at, opensAt: r.opens_at, questions: r.questions, takers: r.takers, averagePercent: r.average_percent }));
}

export async function teacherDetail(teacherId: string, id: string) {
  const q = await ownedQuiz(teacherId, id);
  const [questions, results] = await Promise.all([
    query(`select qq.id, qq.position, qq.body, qq.marks, coalesce(json_agg(json_build_object('id', o.id, 'text', o.body, 'isCorrect', o.is_correct) order by o.position) filter (where o.id is not null), '[]') as options
             from quiz_questions qq left join quiz_options o on o.question_id = qq.id where qq.quiz_id = $1 group by qq.id order by qq.position`, [id]),
    query(`select u.id as student_id, u.first_name, u.last_name,
                  count(a.id) filter (where a.status = 'submitted')::int as attempts,
                  max(a.score) filter (where a.status = 'submitted')::float8 as best, max(a.max_score)::float8 as max_score,
                  max(a.submitted_at) as last_at
             from enrolments e join users u on u.id = e.student_id left join quiz_attempts a on a.student_id = u.id and a.quiz_id = $1
            where e.class_id = $2 and e.session_id = $3 and e.status = 'active' group by u.id order by u.last_name, u.first_name`, [id, q.class_id, q.session_id]),
  ]);
  return {
    id: q.id, classId: q.class_id, subjectId: q.subject_id, title: q.title, instructions: q.instructions, opensAt: q.opens_at, closesAt: q.closes_at,
    durationMinutes: q.duration_minutes, maxAttempts: q.max_attempts, showAnswers: q.show_answers, status: q.status,
    questions: questions.rows.map((x) => ({ id: x.id, text: x.body, marks: num(x.marks), options: x.options })),
    results: results.rows.map((r) => ({ studentId: r.student_id, name: `${r.first_name} ${r.last_name}`, attempts: r.attempts, best: r.best, maxScore: r.max_score, lastAt: r.last_at })),
  };
}

export async function publish(teacherId: string, id: string, ip?: string) {
  const q = await ownedQuiz(teacherId, id);
  if (q.status !== 'draft') throw new AppError(409, 'This quiz is already published.', 'NOT_DRAFT');
  if (new Date(q.closes_at) <= new Date()) throw new AppError(400, 'The closing time must be in the future.', 'VALIDATION_ERROR');
  const qs = (await query(`select qq.position, count(o.id)::int as options, count(o.id) filter (where o.is_correct)::int as correct from quiz_questions qq left join quiz_options o on o.question_id = qq.id where qq.quiz_id = $1 group by qq.id order by qq.position`, [id])).rows;
  if (qs.length === 0) throw new AppError(400, 'Add at least one question.', 'VALIDATION_ERROR');
  const bad = qs.find((x) => x.options < 2 || x.correct !== 1);
  if (bad) throw new AppError(400, `Question ${bad.position} needs at least two options and exactly one correct answer.`, 'VALIDATION_ERROR');
  await query("update quizzes set status = 'published', updated_at = now() where id = $1", [id]);
  const students = (await query(`select e.student_id from enrolments e join users u on u.id = e.student_id and u.status = 'active' where e.class_id = $1 and e.session_id = $2 and e.status = 'active'`, [q.class_id, q.session_id])).rows;
  for (const s of students) await query(`insert into notifications (user_id, type, title, body, link, entity_type, entity_id) values ($1,'assignment_quiz_published',$2,$3,$4,'quiz',$5)`, [s.student_id, `New quiz: ${q.title}`, `Closes ${new Date(q.closes_at).toISOString().slice(0, 10)}`, `/student/quizzes`, id]);
  await audit({ actorId: teacherId, action: 'quiz.published', entityType: 'quiz', entityId: id, ip });
  return { status: 'published' };
}

export async function closeQuiz(teacherId: string, id: string, ip?: string) {
  const q = await ownedQuiz(teacherId, id);
  if (q.status !== 'published') throw new AppError(409, 'Only a published quiz can be closed.', 'NOT_PUBLISHED');
  await query("update quizzes set status = 'closed', updated_at = now() where id = $1", [id]);
  await finaliseOverdue(id); // anyone still mid-quiz is submitted with what they have answered
  await audit({ actorId: teacherId, action: 'quiz.closed', entityType: 'quiz', entityId: id, ip });
  return { status: 'closed' };
}

// ================= Student (and parent read-only) =================
async function studentClass(studentId: string) {
  const e = (await query(`select e.class_id, e.session_id from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current where e.student_id = $1 and e.status = 'active'`, [studentId])).rows[0];
  return e as { class_id: string; session_id: string } | undefined;
}

export async function studentList(studentId: string) {
  const e = await studentClass(studentId);
  if (!e) return [];
  const { rows } = await query(
    `select q.id, q.title, q.status, q.opens_at, q.closes_at, q.duration_minutes, q.max_attempts, q.show_answers, sb.name as subject,
            (select count(*)::int from quiz_questions x where x.quiz_id = q.id) as questions,
            (select count(*)::int from quiz_attempts a where a.quiz_id = q.id and a.student_id = $1 and a.status = 'submitted') as done,
            (select max(a.score)::float8 from quiz_attempts a where a.quiz_id = q.id and a.student_id = $1 and a.status = 'submitted') as best,
            (select max(a.max_score)::float8 from quiz_attempts a where a.quiz_id = q.id and a.student_id = $1 and a.status = 'submitted') as max_score,
            (select a.id from quiz_attempts a where a.quiz_id = q.id and a.student_id = $1 and a.status = 'in_progress' and a.deadline_at > now()) as open_attempt
       from quizzes q join subjects sb on sb.id = q.subject_id
      where q.class_id = $2 and q.session_id = $3 and q.status in ('published', 'closed') and (q.opens_at is null or q.opens_at <= now())
      order by q.closes_at desc`, [studentId, e.class_id, e.session_id]);
  const now = Date.now();
  return rows.map((r) => {
    const isClosed = r.status === 'closed' || new Date(r.closes_at).getTime() <= now;
    return {
      id: r.id, title: r.title, subject: r.subject, questions: r.questions, closesAt: r.closes_at, durationMinutes: r.duration_minutes, maxAttempts: r.max_attempts,
      attemptsUsed: r.done, best: r.best, maxScore: r.max_score, openAttemptId: r.open_attempt,
      state: r.open_attempt ? 'in_progress' : isClosed ? 'closed' : r.done >= r.max_attempts ? 'finished' : 'open',
    };
  });
}

export async function startAttempt(studentId: string, quizId: string) {
  const e = await studentClass(studentId);
  const q = (await query('select * from quizzes where id = $1', [quizId])).rows[0];
  if (!e || !q || q.class_id !== e.class_id || q.session_id !== e.session_id || q.status !== 'published' || (q.opens_at && new Date(q.opens_at) > new Date())) throw notFound();
  if (new Date(q.closes_at) <= new Date()) throw new AppError(409, 'This quiz has closed.', 'CLOSED');
  const open = (await query(`select id from quiz_attempts where quiz_id = $1 and student_id = $2 and status = 'in_progress'`, [quizId, studentId])).rows[0];
  if (open) { await finaliseIfOverdue(open.id); const again = (await query(`select id from quiz_attempts where id = $1 and status = 'in_progress'`, [open.id])).rows[0]; if (again) return { attemptId: again.id as string }; }
  const used = (await query(`select count(*)::int n from quiz_attempts where quiz_id = $1 and student_id = $2 and status = 'submitted'`, [quizId, studentId])).rows[0].n as number;
  if (used >= q.max_attempts) throw new AppError(409, 'You have used all your attempts.', 'NO_ATTEMPTS_LEFT');
  try {
    const r = await query(
      `insert into quiz_attempts (quiz_id, student_id, attempt_no, deadline_at) values ($1,$2,$3, least($4::timestamptz, now() + make_interval(mins => coalesce($5::int, 100000)))) returning id`,
      [quizId, studentId, used + 1, q.closes_at, q.duration_minutes]);
    return { attemptId: r.rows[0].id as string };
  } catch (err: any) {
    if (err.code === '23505') { const a = (await query(`select id from quiz_attempts where quiz_id = $1 and student_id = $2 and status = 'in_progress'`, [quizId, studentId])).rows[0]; if (a) return { attemptId: a.id as string }; }
    throw err;
  }
}

async function ownAttempt(studentId: string, attemptId: string) {
  const a = (await query('select a.*, q.title, q.show_answers, q.duration_minutes from quiz_attempts a join quizzes q on q.id = a.quiz_id where a.id = $1 and a.student_id = $2', [attemptId, studentId])).rows[0];
  if (!a) throw notFound();
  return a;
}

// Scores an attempt from what is saved. Safe to call twice: only the first call changes anything.
async function finalise(attemptId: string, auto: boolean) {
  await query(
    `update quiz_attempts a set status = 'submitted', auto_submitted = $2, submitted_at = case when $2 then least(now(), a.deadline_at) else now() end,
            score = (select coalesce(sum(qq.marks), 0) from quiz_answers qa join quiz_options o on o.id = qa.option_id and o.is_correct join quiz_questions qq on qq.id = qa.question_id where qa.attempt_id = a.id),
            max_score = (select coalesce(sum(marks), 0) from quiz_questions where quiz_id = a.quiz_id)
      where a.id = $1 and a.status = 'in_progress'`, [attemptId, auto]);
}
async function finaliseIfOverdue(attemptId: string) {
  const a = (await query(`select 1 from quiz_attempts where id = $1 and status = 'in_progress' and deadline_at <= now()`, [attemptId])).rowCount;
  if (a) await finalise(attemptId, true);
}
async function finaliseOverdue(quizId: string) {
  const ids = (await query(`select id from quiz_attempts where quiz_id = $1 and status = 'in_progress'`, [quizId])).rows;
  for (const r of ids) await finalise(r.id, true);
}

export async function getAttempt(studentId: string, attemptId: string) {
  let a = await ownAttempt(studentId, attemptId);
  if (a.status === 'in_progress' && new Date(a.deadline_at) <= new Date()) { await finalise(attemptId, true); a = await ownAttempt(studentId, attemptId); }
  const base = { attemptId, quizId: a.quiz_id, title: a.title, status: a.status as 'in_progress' | 'submitted', deadlineAt: a.deadline_at, startedAt: a.started_at, serverNow: new Date().toISOString() };
  if (a.status === 'in_progress') {
    // The correct answers are never sent while a quiz is in progress. Options come in a different order for every attempt.
    const { rows } = await query(
      `select qq.id, qq.position, qq.body, qq.marks, qa.option_id as chosen,
              json_agg(json_build_object('id', o.id, 'text', o.body) order by md5($1::text || o.id::text)) as options
         from quiz_questions qq join quiz_options o on o.question_id = qq.id left join quiz_answers qa on qa.attempt_id = $1 and qa.question_id = qq.id
        where qq.quiz_id = $2 group by qq.id, qa.option_id order by qq.position`, [attemptId, a.quiz_id]);
    return { ...base, questions: rows.map((r) => ({ id: r.id, text: r.body, marks: num(r.marks), chosenOptionId: r.chosen, options: r.options })) };
  }
  const result = { ...base, score: num(a.score), maxScore: num(a.max_score), autoSubmitted: a.auto_submitted, review: null as null | unknown };
  if (a.show_answers) {
    const { rows } = await query(
      `select qq.id, qq.body, qq.marks, qa.option_id as chosen, json_agg(json_build_object('id', o.id, 'text', o.body, 'isCorrect', o.is_correct) order by o.position) as options
         from quiz_questions qq join quiz_options o on o.question_id = qq.id left join quiz_answers qa on qa.attempt_id = $1 and qa.question_id = qq.id
        where qq.quiz_id = $2 group by qq.id, qa.option_id order by qq.position`, [attemptId, a.quiz_id]);
    result.review = rows.map((r) => ({ id: r.id, text: r.body, marks: num(r.marks), chosenOptionId: r.chosen, options: r.options }));
  }
  return result;
}

export async function saveAnswers(studentId: string, attemptId: string, answers: { questionId: string; optionId: string | null }[]) {
  const a = await ownAttempt(studentId, attemptId);
  if (a.status !== 'in_progress') throw new AppError(409, 'This attempt has already been submitted.', 'SUBMITTED');
  if (new Date(a.deadline_at) <= new Date()) { await finalise(attemptId, true); throw new AppError(409, 'Time is up. Your answers so far were submitted.', 'TIME_UP'); }
  await withTransaction(async (c) => {
    for (const x of answers) {
      if (x.optionId === null) { await c.query('delete from quiz_answers where attempt_id = $1 and question_id = $2', [attemptId, x.questionId]); continue; }
      const ok = (await c.query(`select 1 from quiz_options o join quiz_questions qq on qq.id = o.question_id where o.id = $1 and qq.id = $2 and qq.quiz_id = $3`, [x.optionId, x.questionId, a.quiz_id])).rowCount;
      if (!ok) throw new AppError(400, 'That answer does not belong to this question.', 'VALIDATION_ERROR');
      await c.query(`insert into quiz_answers (attempt_id, question_id, option_id) values ($1,$2,$3) on conflict (attempt_id, question_id) do update set option_id = excluded.option_id, saved_at = now()`, [attemptId, x.questionId, x.optionId]);
    }
  });
  return { saved: answers.length };
}

export async function submitAttempt(studentId: string, attemptId: string, answers?: { questionId: string; optionId: string | null }[]) {
  const a = await ownAttempt(studentId, attemptId);
  if (a.status === 'submitted') return getAttempt(studentId, attemptId); // pressing submit twice is harmless
  const late = new Date(a.deadline_at) <= new Date();
  if (answers && answers.length && !late) await saveAnswers(studentId, attemptId, answers);
  await finalise(attemptId, late);
  return getAttempt(studentId, attemptId);
}

export async function parentSummary(parentId: string) {
  const kids = (await query('select u.id, u.first_name, u.last_name from parent_students ps join users u on u.id = ps.student_id where ps.parent_id = $1 order by u.first_name', [parentId])).rows;
  return Promise.all(kids.map(async (k) => ({ studentId: k.id as string, name: `${k.first_name} ${k.last_name}`, quizzes: (await studentList(k.id)).map(({ openAttemptId, ...q }) => q) })));
}
