import { query } from '../../db/pool';

const CLASS_NAME = `c.stage || ' ' || c.year || coalesce(c.arm, '')`;
const num = (v: unknown) => Number(v ?? 0);

// A count that must never take the whole dashboard down (for example a table from a newer migration that has not been run yet).
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> { try { return await fn(); } catch { return fallback; } }

export async function adminOverview() {
  const [people, byClass, work, applications, fees, announcements, actions, inbox] = await Promise.all([
    query(`select role, count(*)::int n from users where status = 'active' group by role`),
    query(`select c.id, ${CLASS_NAME} as name, count(e.student_id)::int as students
             from classes c join academic_sessions s on s.is_current
             left join enrolments e on e.class_id = c.id and e.session_id = s.id and e.status = 'active'
            group by c.id order by c.stage, c.year, c.arm`),
    query(`select (select count(*)::int from assignments a join academic_sessions s on s.id = a.session_id and s.is_current where a.status = 'published' and a.due_at > now()) as open_assignments,
                  (select count(*)::int from submissions sb join assignments a on a.id = sb.assignment_id join academic_sessions s on s.id = a.session_id and s.is_current where sb.status = 'submitted') as awaiting_marking,
                  (select count(*)::int from assignments a join academic_sessions s on s.id = a.session_id and s.is_current where a.status = 'published' and a.due_at < now() and exists (select 1 from submissions sb where sb.assignment_id = a.id and sb.status = 'submitted')) as past_due_unmarked`),
    query(`select id, reference, first_name, last_name, class_stage, class_year, status, created_at from admission_applications order by created_at desc limit 5`),
    query(`with inv as (
             select i.id, coalesce((select sum(amount_kobo) from invoice_lines l where l.invoice_id = i.id), 0) as total,
                    coalesce((select sum(amount_kobo) from payments p where p.invoice_id = i.id and p.reversed_at is null), 0) as paid
               from invoices i join terms t on t.id = i.term_id and t.is_current where i.status = 'open')
           select (select s.name || ' · Term ' || t.term_number from terms t join academic_sessions s on s.id = t.session_id where t.is_current) as term,
                  coalesce(sum(total), 0)::bigint as billed, coalesce(sum(paid), 0)::bigint as collected,
                  coalesce(sum(greatest(total - paid, 0)), 0)::bigint as outstanding,
                  count(*) filter (where total - paid > 0)::int as students_owing
             from inv`),
    query(`select id, title, kind, pinned, published_at from site_posts where status = 'published' and kind = 'announcement' order by published_at desc nulls last limit 5`),
    query(`select a.id, a.action, a.entity_type, a.created_at, u.first_name, u.last_name from audit_logs a left join users u on u.id = a.actor_id order by a.id desc limit 8`),
    Promise.all([
      safe(async () => num((await query(`select count(*)::int n from contact_messages where status = 'new'`)).rows[0].n), 0),
      safe(async () => num((await query(`select count(*)::int n from admission_applications where status in ('received','under_review')`)).rows[0].n), 0),
      safe(async () => num((await query(`select count(*)::int n from message_threads where reported_at is not null and status = 'open'`)).rows[0].n), null as number | null),
    ]),
  ]);
  const role = (r: string) => (people.rows.find((p) => p.role === r)?.n ?? 0) as number;
  const f = fees.rows[0];
  return {
    people: { students: role('student'), teachers: role('teacher'), parents: role('parent') },
    studentsByClass: byClass.rows.map((r) => ({ classId: r.id, name: r.name, students: r.students })),
    work: { openAssignments: work.rows[0].open_assignments, awaitingMarking: work.rows[0].awaiting_marking, pastDueUnmarked: work.rows[0].past_due_unmarked },
    applications: { waiting: inbox[1], recent: applications.rows.map((a) => ({ id: a.id, reference: a.reference, name: `${a.first_name} ${a.last_name}`, applyingFor: `${a.class_stage} ${a.class_year}`, status: a.status, createdAt: a.created_at })) },
    fees: f.term ? { term: f.term, billedKobo: num(f.billed), collectedKobo: num(f.collected), outstandingKobo: num(f.outstanding), studentsOwing: f.students_owing } : null,
    announcements: announcements.rows.map((p) => ({ id: p.id, title: p.title, pinned: p.pinned, publishedAt: p.published_at })),
    recentActions: actions.rows.map((a) => ({ id: String(a.id), action: a.action, entityType: a.entity_type, createdAt: a.created_at, actor: a.first_name ? `${a.first_name} ${a.last_name}` : 'System' })),
    attention: { newEnquiries: inbox[0], reportedConversations: inbox[2] },
  };
}

export async function teacherOverview(teacherId: string) {
  const [teaching, assignments, announcements, unread] = await Promise.all([
    query(`select ta.class_id, ${CLASS_NAME} as class_name, sb.name as subject
             from teaching_assignments ta join academic_sessions s on s.id = ta.session_id and s.is_current
             join classes c on c.id = ta.class_id join subjects sb on sb.id = ta.subject_id
            where ta.teacher_id = $1 order by c.stage, c.year, c.arm, sb.name`, [teacherId]),
    query(`select a.id, a.title, a.due_at, ${CLASS_NAME} as class_name, sb.name as subject,
                  count(s.id) filter (where s.status = 'submitted')::int as waiting,
                  count(distinct s.student_id)::int as handed_in,
                  (select count(*)::int from enrolments e where e.class_id = a.class_id and e.session_id = a.session_id and e.status = 'active') as pupils
             from assignments a join academic_sessions cs on cs.id = a.session_id and cs.is_current
             join classes c on c.id = a.class_id join subjects sb on sb.id = a.subject_id
             left join submissions s on s.assignment_id = a.id
            where a.teacher_id = $1 and a.status = 'published'
            group by a.id, c.id, sb.id`, [teacherId]),
    query(`select id, title, pinned, published_at from site_posts where status = 'published' and kind = 'announcement' order by published_at desc nulls last limit 5`),
    safe(async () => num((await query(`select count(*)::int n from message_threads where staff_id = $1 and last_sender_id is distinct from $1 and last_sender_id is not null and (staff_last_read_at is null or last_message_at > staff_last_read_at)`, [teacherId])).rows[0].n), null as number | null),
  ]);
  const mapA = (a: any) => ({ id: a.id, title: a.title, className: a.class_name, subject: a.subject, dueAt: a.due_at, waiting: a.waiting, handedIn: a.handed_in, pupils: a.pupils });
  const now = Date.now();
  const toMark = assignments.rows.filter((a) => a.waiting > 0).sort((x, y) => +new Date(x.due_at) - +new Date(y.due_at)).map(mapA);
  const upcoming = assignments.rows.filter((a) => +new Date(a.due_at) > now).sort((x, y) => +new Date(x.due_at) - +new Date(y.due_at)).slice(0, 5).map(mapA);
  const classIds = new Set(teaching.rows.map((t) => t.class_id));
  return {
    classes: classIds.size,
    teaching: teaching.rows.map((t) => ({ classId: t.class_id, className: t.class_name, subject: t.subject })),
    toMark, upcoming,
    waitingTotal: toMark.reduce((n, a) => n + a.waiting, 0),
    announcements: announcements.rows.map((p) => ({ id: p.id, title: p.title, pinned: p.pinned, publishedAt: p.published_at })),
    unreadMessages: unread,
  };
}
