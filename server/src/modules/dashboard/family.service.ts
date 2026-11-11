import { query } from '../../db/pool';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const TODAY = `(now() at time zone 'Africa/Lagos')::date`;
const num = (v: unknown) => Number(v ?? 0);
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> { try { return await fn(); } catch { return fallback; } }

// One pupil's overview. The caller must already have proved the viewer is that pupil or a linked parent.
// Fees are only included for parents.
export async function childOverview(studentId: string, withFees: boolean) {
  const enrol = (await query(
    `select e.class_id, e.session_id, ${CLASS_NAME} as class_name, s.name as session_name
       from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current join classes c on c.id = e.class_id
      where e.student_id = $1 and e.status = 'active'`, [studentId])).rows[0];
  if (!enrol) return { className: null, sessionName: null, lessonsToday: [], exams: [], assignments: { due: [], overdueCount: 0 }, recentMarks: [], attendance: null, latestResult: null, fees: null };
  const { class_id: classId, session_id: sessionId } = enrol;

  const [lessons, exams, due, overdue, marks, attendance, result, fees] = await Promise.all([
    query(`select to_char(t.start_time, 'HH24:MI') as start, to_char(t.end_time, 'HH24:MI') as "end", t.room, sb.name as subject,
                  (select u.first_name || ' ' || u.last_name from teaching_assignments ta join users u on u.id = ta.teacher_id
                    where ta.session_id = t.session_id and ta.class_id = t.class_id and ta.subject_id = t.subject_id order by u.last_name limit 1) as teacher
             from timetable_entries t join subjects sb on sb.id = t.subject_id
            where t.session_id = $1 and t.class_id = $2 and t.day_of_week = extract(isodow from ${TODAY})::int
            order by t.start_time`, [sessionId, classId]),
    query(`select p.exam_date, to_char(p.start_time, 'HH24:MI') as start, to_char(p.end_time, 'HH24:MI') as "end", p.venue, sb.name as subject, es.title
             from exam_papers p join exam_schedules es on es.id = p.schedule_id and es.is_published
             join terms tm on tm.id = es.term_id and tm.session_id = $1 join subjects sb on sb.id = p.subject_id
            where p.class_id = $2 and p.exam_date >= ${TODAY} order by p.exam_date, p.start_time limit 5`, [sessionId, classId]),
    query(`select a.id, a.title, a.due_at, sb.name as subject,
                  (select s.status from submissions s where s.assignment_id = a.id and s.student_id = $3 order by s.attempt desc limit 1) as my_status
             from assignments a join subjects sb on sb.id = a.subject_id
            where a.class_id = $2 and a.session_id = $1 and a.status = 'published' and (a.publish_at is null or a.publish_at <= now()) and a.due_at > now()
            order by (exists (select 1 from submissions s where s.assignment_id = a.id and s.student_id = $3)), a.due_at limit 5`, [sessionId, classId, studentId]),
    query(`select count(*)::int n from assignments a
            where a.class_id = $2 and a.session_id = $1 and a.status = 'published' and (a.publish_at is null or a.publish_at <= now()) and a.due_at < now()
              and not exists (select 1 from submissions s where s.assignment_id = a.id and s.student_id = $3)`, [sessionId, classId, studentId]),
    query(`select a.id, a.title, a.max_marks, s.marks, s.status, coalesce(s.returned_at, s.graded_at) as at
             from submissions s join assignments a on a.id = s.assignment_id
            where s.student_id = $1 and s.status in ('graded', 'returned') and s.marks is not null order by coalesce(s.returned_at, s.graded_at) desc nulls last limit 3`, [studentId]),
    query(`select tm.term_number,
                  (select count(*)::int from attendance_registers r where r.class_id = $2 and r.term_id = tm.id) as opened,
                  count(ar.*) filter (where ar.status = 'present')::int as present,
                  count(ar.*) filter (where ar.status = 'late')::int as late,
                  count(ar.*) filter (where ar.status = 'absent')::int as absent
             from terms tm left join attendance_registers r on r.term_id = tm.id and r.class_id = $2
             left join attendance_records ar on ar.register_id = r.id and ar.student_id = $3
            where tm.session_id = $1 and tm.is_current group by tm.id`, [sessionId, classId, studentId]),
    query(`select rp.term_id, tm.term_number, s.name as session_name
             from result_publications rp join terms tm on tm.id = rp.term_id join academic_sessions s on s.id = tm.session_id
             join enrolments e on e.class_id = rp.class_id and e.session_id = s.id and e.student_id = $1
            order by rp.published_at desc limit 1`, [studentId]),
    withFees ? safe(async () => (await query(
      `select i.id, i.number, coalesce((select sum(amount_kobo) from invoice_lines l where l.invoice_id = i.id), 0) as total,
              coalesce((select sum(amount_kobo) from payments p where p.invoice_id = i.id and p.reversed_at is null), 0) as paid, i.due_date
         from invoices i join terms tm on tm.id = i.term_id and tm.is_current where i.student_id = $1 and i.status = 'open'`, [studentId])).rows[0] ?? null, null) : Promise.resolve(null),
  ]);

  const att = attendance.rows[0];
  const attended = att ? att.present + att.late : 0;
  return {
    className: enrol.class_name, sessionName: enrol.session_name,
    lessonsToday: lessons.rows,
    exams: exams.rows.map((e) => ({ date: e.exam_date, start: e.start, end: e.end, venue: e.venue, subject: e.subject, title: e.title })),
    assignments: {
      due: due.rows.map((a) => ({ id: a.id, title: a.title, subject: a.subject, dueAt: a.due_at, handedIn: a.my_status !== null })),
      overdueCount: overdue.rows[0].n as number,
    },
    recentMarks: marks.rows.map((m) => ({ id: m.id, title: m.title, marks: num(m.marks), maxMarks: num(m.max_marks), at: m.at })),
    attendance: att && att.opened > 0 ? { term: att.term_number, opened: att.opened, present: att.present, late: att.late, absent: att.absent, percent: Math.round((attended / att.opened) * 100) } : null,
    latestResult: result.rows[0] ? { termId: result.rows[0].term_id, label: `${result.rows[0].session_name}, Term ${result.rows[0].term_number}` } : null,
    fees: fees ? (() => { const total = num(fees.total), paid = num(fees.paid); return { invoiceId: fees.id, number: fees.number, totalKobo: total, paidKobo: paid, outstandingKobo: Math.max(total - paid, 0), dueDate: fees.due_date }; })() : null,
  };
}

async function unreadNotifications(userId: string) {
  return num((await query('select count(*)::int n from notifications where user_id = $1 and read_at is null', [userId])).rows[0].n);
}

export async function studentOverview(studentId: string) {
  const [o, unread] = await Promise.all([childOverview(studentId, false), unreadNotifications(studentId)]);
  return { ...o, unreadNotifications: unread };
}

export async function parentOverview(parentId: string) {
  const kids = (await query(
    `select u.id, u.first_name, u.last_name from parent_students ps join users u on u.id = ps.student_id where ps.parent_id = $1 order by u.first_name`, [parentId])).rows;
  const children = await Promise.all(kids.map(async (k) => ({ studentId: k.id as string, name: `${k.first_name} ${k.last_name}`, ...(await childOverview(k.id, true)) })));
  const [unread, unreadMessages] = await Promise.all([
    unreadNotifications(parentId),
    safe(async () => num((await query(`select count(*)::int n from message_threads where parent_id = $1 and last_sender_id is distinct from $1 and last_sender_id is not null and (parent_last_read_at is null or last_message_at > parent_last_read_at)`, [parentId])).rows[0].n), null as number | null),
  ]);
  return { children, unreadNotifications: unread, unreadMessages };
}
