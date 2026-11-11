import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';

type Actor = { id: string; role: 'admin' | 'teacher' | 'student' | 'parent'; ip?: string };
const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const HOURLY_LIMIT = 20;
const notFound = () => new AppError(404, 'Conversation not found', 'NOT_FOUND');

// ---- Who may contact whom (the safeguarding rule) ----
// A parent may write to the school office about any linked child, and to a teacher only when that teacher teaches the child's
// class or is its form teacher in the current session. A teacher may only write to a parent of a child in such a class.
async function teacherReaches(teacherId: string, studentId: string): Promise<boolean> {
  const { rowCount } = await query(
    `select 1 from academic_sessions s
       join enrolments e on e.session_id = s.id and e.student_id = $2 and e.status = 'active'
      where s.is_current and (
        exists (select 1 from teaching_assignments ta where ta.session_id = s.id and ta.class_id = e.class_id and ta.teacher_id = $1)
        or exists (select 1 from class_form_teachers f where f.session_id = s.id and f.class_id = e.class_id and f.teacher_id = $1))
        and exists (select 1 from users t where t.id = $1 and t.role = 'teacher' and t.status = 'active')`, [teacherId, studentId]);
  return !!rowCount;
}
async function isLinked(parentId: string, studentId: string) {
  return !!(await query('select 1 from parent_students ps join users p on p.id = ps.parent_id and p.status = \'active\' where ps.parent_id = $1 and ps.student_id = $2', [parentId, studentId])).rowCount;
}

async function checkRate(userId: string) {
  const n = (await query("select count(*)::int as n from messages where sender_id = $1 and created_at > now() - interval '1 hour'", [userId])).rows[0].n as number;
  if (n >= HOURLY_LIMIT) throw new AppError(429, `You have sent ${HOURLY_LIMIT} messages in the last hour. Please try again later.`, 'RATE_LIMITED');
}

// ---- Contacts: the people the caller is allowed to start a conversation with ----
export async function contacts(a: Actor) {
  if (a.role === 'parent') {
    const kids = (await query(
      `select u.id, u.first_name, u.last_name, ${CLASS_NAME} as class_name, e.class_id, s.id as session_id
         from parent_students ps join users u on u.id = ps.student_id
         left join academic_sessions s on s.is_current
         left join enrolments e on e.student_id = u.id and e.session_id = s.id and e.status = 'active'
         left join classes c on c.id = e.class_id
        where ps.parent_id = $1 order by u.first_name`, [a.id])).rows;
    const out = [];
    for (const k of kids) {
      const teachers = k.class_id ? (await query(
        `select t.id, t.first_name, t.last_name,
                array_remove(array_agg(distinct sb.name), null) as subjects,
                bool_or(f.teacher_id is not null) as is_form
           from users t
           left join teaching_assignments ta on ta.teacher_id = t.id and ta.session_id = $2 and ta.class_id = $1
           left join subjects sb on sb.id = ta.subject_id
           left join class_form_teachers f on f.teacher_id = t.id and f.session_id = $2 and f.class_id = $1
          where t.role = 'teacher' and t.status = 'active' and (ta.id is not null or f.teacher_id is not null)
          group by t.id order by t.last_name`, [k.class_id, k.session_id])).rows : [];
      out.push({
        studentId: k.id, studentName: `${k.first_name} ${k.last_name}`, className: k.class_name,
        teachers: teachers.map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}`, subjects: t.subjects, isFormTeacher: t.is_form })),
      });
    }
    return out; // names and roles only: no phone numbers or email addresses of staff are ever returned
  }
  if (a.role === 'teacher') {
    const { rows } = await query(
      `select distinct p.id as parent_id, p.first_name as pf, p.last_name as pl, s.id as student_id, s.first_name as sf, s.last_name as sl, ${CLASS_NAME} as class_name
         from academic_sessions cs
         join enrolments e on e.session_id = cs.id and e.status = 'active'
         join classes c on c.id = e.class_id
         join parent_students ps on ps.student_id = e.student_id
         join users p on p.id = ps.parent_id and p.status = 'active'
         join users s on s.id = e.student_id
        where cs.is_current and (
          exists (select 1 from teaching_assignments ta where ta.session_id = cs.id and ta.class_id = e.class_id and ta.teacher_id = $1)
          or exists (select 1 from class_form_teachers f where f.session_id = cs.id and f.class_id = e.class_id and f.teacher_id = $1))
        order by pl, pf, sl`, [a.id]);
    return rows.map((r) => ({ parentId: r.parent_id, parentName: `${r.pf} ${r.pl}`, studentId: r.student_id, studentName: `${r.sf} ${r.sl}`, className: r.class_name }));
  }
  throw new AppError(403, 'Not allowed', 'FORBIDDEN');
}

// ---- Access to one thread ----
interface Thread { id: string; parent_id: string; staff_id: string | null; student_id: string; subject: string; status: string; reported_at: Date | null }
type Side = 'parent' | 'staff' | 'oversight';
async function loadThread(a: Actor, id: string): Promise<{ t: Thread; side: Side }> {
  const t = (await query('select * from message_threads where id = $1', [id])).rows[0] as Thread | undefined;
  if (!t) throw notFound();
  if (a.role === 'parent' && t.parent_id === a.id) return { t, side: 'parent' };
  if (a.role === 'teacher' && t.staff_id === a.id) return { t, side: 'staff' };
  if (a.role === 'admin') return { t, side: t.staff_id === null ? 'staff' : 'oversight' };
  throw notFound(); // never reveal that someone else's thread exists
}

const summary = (r: any, side: 'parent' | 'staff') => {
  const readAt: Date | null = side === 'parent' ? r.parent_last_read_at : r.staff_last_read_at;
  return {
    id: r.id, subject: r.subject, status: r.status, studentId: r.student_id, studentName: `${r.sf} ${r.sl}`,
    parentName: `${r.pf} ${r.pl}`, staffName: r.staff_id ? `${r.tf} ${r.tl}` : 'School office',
    lastMessageAt: r.last_message_at, lastSnippet: r.snippet ?? '', reported: !!r.reported_at,
    unread: r.last_sender_id !== null && r.last_sender_id !== r.me && (!readAt || new Date(r.last_message_at) > new Date(readAt)),
  };
};
const THREAD_SELECT = `select th.*, p.first_name pf, p.last_name pl, s.first_name sf, s.last_name sl, t.first_name tf, t.last_name tl,
    (select left(body, 120) from messages m where m.thread_id = th.id and m.hidden_at is null order by m.created_at desc limit 1) as snippet
  from message_threads th join users p on p.id = th.parent_id join users s on s.id = th.student_id left join users t on t.id = th.staff_id`;

export async function listThreads(a: Actor, f: { status?: string; page: number; pageSize: number }) {
  const side = a.role === 'parent' ? 'parent' : 'staff';
  // Administrators handle the school-office threads. Teachers and parents see only their own.
  const who = a.role === 'parent' ? 'th.parent_id = $1' : a.role === 'teacher' ? 'th.staff_id = $1' : '(th.staff_id is null and $1::uuid is not null)';
  const where = `${who} and ($2::text is null or th.status = $2)`;
  const total = (await query(`select count(*)::int n from message_threads th where ${where}`, [a.id, f.status ?? null])).rows[0].n as number;
  const { rows } = await query(`${THREAD_SELECT} where ${where} order by th.last_message_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, [a.id, f.status ?? null]);
  return { items: rows.map((r) => summary({ ...r, me: a.id }, side)), page: f.page, pageSize: f.pageSize, total };
}

export async function unreadCount(a: Actor) {
  const side = a.role === 'parent' ? 'parent' : 'staff';
  const who = a.role === 'parent' ? 'th.parent_id = $1' : a.role === 'teacher' ? 'th.staff_id = $1' : '(th.staff_id is null and $1::uuid is not null)';
  const col = side === 'parent' ? 'th.parent_last_read_at' : 'th.staff_last_read_at';
  const n = (await query(`select count(*)::int n from message_threads th where ${who} and th.last_sender_id is distinct from $1 and th.last_sender_id is not null and (${col} is null or th.last_message_at > ${col})`, [a.id])).rows[0].n;
  return { unread: n as number };
}

export async function getThread(a: Actor, id: string) {
  const { t, side } = await loadThread(a, id);
  const row = (await query(`${THREAD_SELECT} where th.id = $1`, [id])).rows[0];
  const msgs = (await query(
    `select m.id, m.sender_id, m.body, m.created_at, m.hidden_at, m.reported_at, u.first_name, u.last_name, u.role
       from messages m join users u on u.id = m.sender_id where m.thread_id = $1 order by m.created_at, m.id`, [id])).rows;
  if (side === 'oversight') {
    // Administrators may review any conversation for safeguarding, and every such view is recorded.
    await audit({ actorId: a.id, action: 'messages.thread_reviewed', entityType: 'message_thread', entityId: id, ip: a.ip });
  } else {
    await query(`update message_threads set ${side === 'parent' ? 'parent_last_read_at' : 'staff_last_read_at'} = now() where id = $1`, [id]);
  }
  return {
    ...summary({ ...row, me: a.id }, side === 'parent' ? 'parent' : 'staff'), side, canReply: t.status === 'open' && side !== 'oversight', canClose: side !== 'parent',
    messages: msgs.map((m) => ({
      id: m.id, mine: m.sender_id === a.id, senderName: `${m.first_name} ${m.last_name}`, senderRole: m.role, createdAt: m.created_at, reported: !!m.reported_at,
      // Removed messages show a notice to everyone except administrators, who can still read them.
      removed: !!m.hidden_at, body: m.hidden_at && a.role !== 'admin' ? null : m.body,
    })),
  };
}

async function notify(userIds: string[], title: string, link: string, threadId: string, body: string) {
  for (const uid of userIds) {
    await query(`insert into notifications (user_id, type, title, body, link, entity_type, entity_id) values ($1,'message',$2,$3,$4,'message_thread',$5)`,
      [uid, title, body.slice(0, 140), link, threadId]);
  }
}
const portal = (role: string) => (role === 'parent' ? '/parent' : role === 'teacher' ? '/teacher' : '/admin');

export async function startThread(a: Actor, i: { studentId: string; recipientId?: string | null; parentId?: string; subject: string; body: string }) {
  if (a.role !== 'parent' && a.role !== 'teacher' && a.role !== 'admin') throw new AppError(403, 'Not allowed', 'FORBIDDEN');
  let parentId: string; let staffId: string | null;
  if (a.role === 'parent') {
    parentId = a.id; staffId = i.recipientId ?? null;
    if (!(await isLinked(parentId, i.studentId))) throw new AppError(403, 'You can only write about your own children.', 'FORBIDDEN');
    if (staffId && !(await teacherReaches(staffId, i.studentId))) throw new AppError(403, 'That teacher does not teach your child. You can write to the school office instead.', 'FORBIDDEN');
  } else {
    if (!i.parentId) throw new AppError(400, 'Choose a parent or guardian.', 'VALIDATION_ERROR');
    parentId = i.parentId; staffId = a.role === 'teacher' ? a.id : null;
    if (!(await isLinked(parentId, i.studentId))) throw new AppError(403, 'That person is not linked to this student.', 'FORBIDDEN');
    if (a.role === 'teacher' && !(await teacherReaches(a.id, i.studentId))) throw new AppError(403, 'You can only write to parents of pupils you teach.', 'FORBIDDEN');
  }
  await checkRate(a.id);
  const id = await withTransaction(async (c) => {
    const th = await c.query(
      `insert into message_threads (parent_id, staff_id, student_id, subject, started_by, last_sender_id, ${a.role === 'parent' ? 'parent_last_read_at' : 'staff_last_read_at'})
       values ($1,$2,$3,$4,$5,$5, now()) returning id`, [parentId, staffId, i.studentId, i.subject, a.id]);
    await c.query('insert into messages (thread_id, sender_id, body) values ($1,$2,$3)', [th.rows[0].id, a.id, i.body]);
    return th.rows[0].id as string;
  });
  await afterSend(a, id, parentId, staffId, i.body, i.subject);
  return { id };
}

async function afterSend(a: Actor, threadId: string, parentId: string, staffId: string | null, body: string, subject: string) {
  const sender = (await query('select first_name, last_name from users where id = $1', [a.id])).rows[0];
  const name = `${sender.first_name} ${sender.last_name}`;
  if (a.role === 'parent') {
    const to = staffId ? [staffId] : (await query("select id from users where role = 'admin' and status = 'active'")).rows.map((r) => r.id as string);
    await notify(to, `New message from ${name}`, `${staffId ? '/teacher' : '/admin'}/messages/${threadId}`, threadId, `${subject}: ${body}`);
  } else {
    await notify([parentId], `New message from ${staffId ? name : 'the school office'}`, `/parent/messages/${threadId}`, threadId, `${subject}: ${body}`);
  }
}

export async function reply(a: Actor, id: string, body: string) {
  const { t, side } = await loadThread(a, id);
  if (side === 'oversight') throw new AppError(403, 'Administrators can review this conversation but cannot reply to it.', 'FORBIDDEN');
  if (t.status !== 'open') throw new AppError(409, 'This conversation is closed.', 'CLOSED');
  if (side === 'parent' && !(await isLinked(t.parent_id, t.student_id))) throw new AppError(403, 'You are no longer linked to this student.', 'FORBIDDEN');
  if (side === 'staff' && a.role === 'teacher' && !(await teacherReaches(a.id, t.student_id))) throw new AppError(403, 'You no longer teach this pupil, so you cannot continue this conversation.', 'FORBIDDEN');
  await checkRate(a.id);
  const m = await query('insert into messages (thread_id, sender_id, body) values ($1,$2,$3) returning id', [id, a.id, body]);
  await query(`update message_threads set last_message_at = now(), last_sender_id = $2, ${side === 'parent' ? 'parent_last_read_at' : 'staff_last_read_at'} = now() where id = $1`, [id, a.id]);
  await afterSend(a, id, t.parent_id, t.staff_id, body, t.subject);
  return { id: m.rows[0].id as string };
}

export async function setStatus(a: Actor, id: string, status: 'open' | 'closed') {
  const { side } = await loadThread(a, id);
  if (side === 'parent') throw new AppError(403, 'Only the school can close or reopen a conversation.', 'FORBIDDEN');
  await query('update message_threads set status = $2 where id = $1', [id, status]);
  await audit({ actorId: a.id, action: status === 'closed' ? 'messages.thread_closed' : 'messages.thread_reopened', entityType: 'message_thread', entityId: id, ip: a.ip });
  return { status };
}

// A parent or teacher can flag a message for the administrators to look at.
export async function report(a: Actor, messageId: string, reason: string) {
  const m = (await query('select m.id, m.thread_id, m.sender_id from messages m where m.id = $1', [messageId])).rows[0];
  if (!m) throw notFound();
  await loadThread(a, m.thread_id); // proves the caller is in this conversation
  if (m.sender_id === a.id) throw new AppError(400, 'You cannot report your own message.', 'VALIDATION_ERROR');
  await query('update messages set reported_at = now(), reported_by = $2, report_reason = $3 where id = $1', [messageId, a.id, reason]);
  await query('update message_threads set reported_at = coalesce(reported_at, now()) where id = $1', [m.thread_id]);
  await audit({ actorId: a.id, action: 'messages.reported', entityType: 'message', entityId: messageId, metadata: { threadId: m.thread_id }, ip: a.ip });
  const admins = (await query("select id from users where role = 'admin' and status = 'active'")).rows.map((r) => r.id as string);
  await notify(admins, 'A message was reported', `/admin/messages/${m.thread_id}`, m.thread_id, reason);
  return { reported: true };
}

// ---- Administrator oversight ----
export async function adminList(f: { reported?: boolean; q?: string; page: number; pageSize: number }) {
  const params = [f.reported ? true : null, f.q ? `%${f.q}%` : null];
  const where = `($1::boolean is null or th.reported_at is not null) and ($2::text is null or th.subject ilike $2 or p.first_name || ' ' || p.last_name ilike $2 or s.first_name || ' ' || s.last_name ilike $2 or t.first_name || ' ' || t.last_name ilike $2)`;
  const total = (await query(`select count(*)::int n from message_threads th join users p on p.id = th.parent_id join users s on s.id = th.student_id left join users t on t.id = th.staff_id where ${where}`, params)).rows[0].n as number;
  const { rows } = await query(`${THREAD_SELECT} where ${where} order by th.last_message_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return { items: rows.map((r) => summary({ ...r, me: null }, 'staff')), page: f.page, pageSize: f.pageSize, total };
}

export async function hideMessage(a: Actor, messageId: string, hidden: boolean, reason: string | undefined) {
  const { rowCount } = await query('update messages set hidden_at = case when $2 then now() else null end, hidden_by = case when $2 then $3::uuid else null end, hidden_reason = case when $2 then $4 else null end where id = $1', [messageId, hidden, a.id, reason ?? null]);
  if (!rowCount) throw notFound();
  await audit({ actorId: a.id, action: hidden ? 'messages.hidden' : 'messages.unhidden', entityType: 'message', entityId: messageId, metadata: { reason }, ip: a.ip });
  return { hidden };
}
