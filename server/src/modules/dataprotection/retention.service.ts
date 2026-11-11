import { query, withTransaction } from '../../db/pool';
import { audit } from '../../services/audit';
import { storageDelete } from './retention.storage';

// How long things are kept. Defaults are cautious and can be changed with environment variables (see PHASE11_README.md).
// The school has not yet decided its retention periods (REMAINING-WORK section 4), so confirm these before going live.
const days = (name: string, fallback: number | null): number | null => {
  const raw = process.env[name]; if (raw === undefined || raw === '') return fallback;
  const n = Number(raw); return Number.isInteger(n) && n > 0 ? n : fallback;
};
export const policy = () => ({
  tokenGraceDays: days('RETENTION_TOKEN_DAYS', 30),
  readNotificationDays: days('RETENTION_READ_NOTIFICATION_DAYS', 90),
  anyNotificationDays: days('RETENTION_ANY_NOTIFICATION_DAYS', 365),
  contactArchivedDays: days('RETENTION_CONTACT_DAYS', 365),
  applicationDays: days('RETENTION_APPLICATION_DAYS', 365),
  orphanFileDays: days('RETENTION_ORPHAN_FILE_DAYS', 7),
  closedThreadDays: days('RETENTION_CLOSED_MESSAGE_DAYS', null), // off unless set: the school must decide how long messages are kept
});

interface Rule { key: string; label: string; rule: string; count: string; remove: string; days: number | null }
function rules(): Rule[] {
  const p = policy();
  return [
    { key: 'auth_tokens', label: 'Used or expired activation and reset links', days: p.tokenGraceDays,
      rule: `used or expired more than ${p.tokenGraceDays} days ago`,
      count: `select count(*)::int n from auth_tokens where (used_at is not null and used_at < now() - make_interval(days => $1)) or expires_at < now() - make_interval(days => $1)`,
      remove: `delete from auth_tokens where (used_at is not null and used_at < now() - make_interval(days => $1)) or expires_at < now() - make_interval(days => $1)` },
    { key: 'refresh_tokens', label: 'Old sign-in sessions', days: p.tokenGraceDays,
      rule: `revoked or expired more than ${p.tokenGraceDays} days ago`,
      count: `select count(*)::int n from refresh_tokens where coalesce(revoked_at, expires_at) < now() - make_interval(days => $1) and expires_at < now()`,
      remove: `delete from refresh_tokens where coalesce(revoked_at, expires_at) < now() - make_interval(days => $1) and expires_at < now()` },
    { key: 'read_notifications', label: 'Read notifications', days: p.readNotificationDays,
      rule: `read more than ${p.readNotificationDays} days ago`,
      count: `select count(*)::int n from notifications where read_at is not null and read_at < now() - make_interval(days => $1)`,
      remove: `delete from notifications where read_at is not null and read_at < now() - make_interval(days => $1)` },
    { key: 'old_notifications', label: 'Any notification, read or not', days: p.anyNotificationDays,
      rule: `created more than ${p.anyNotificationDays} days ago`,
      count: `select count(*)::int n from notifications where created_at < now() - make_interval(days => $1)`,
      remove: `delete from notifications where created_at < now() - make_interval(days => $1)` },
    { key: 'contact_messages', label: 'Archived website enquiries', days: p.contactArchivedDays,
      rule: `archived and received more than ${p.contactArchivedDays} days ago (new and read ones are never removed)`,
      count: `select count(*)::int n from contact_messages where status = 'archived' and created_at < now() - make_interval(days => $1)`,
      remove: `delete from contact_messages where status = 'archived' and created_at < now() - make_interval(days => $1)` },
    // Applicants who became students are never touched: they are part of the school record.
    { key: 'applications', label: 'Declined or withdrawn admission applications', days: p.applicationDays,
      rule: `declined or withdrawn, last updated more than ${p.applicationDays} days ago, never made a student`,
      count: `select count(*)::int n from admission_applications where status in ('declined','withdrawn') and converted_student_id is null and updated_at < now() - make_interval(days => $1)`,
      remove: `delete from admission_applications where status in ('declined','withdrawn') and converted_student_id is null and updated_at < now() - make_interval(days => $1)` },
    { key: 'closed_threads', label: 'Closed parent and staff conversations', days: p.closedThreadDays,
      rule: p.closedThreadDays ? `closed, with no new message for more than ${p.closedThreadDays} days, and not reported` : 'switched off: messages are kept until the school sets RETENTION_CLOSED_MESSAGE_DAYS',
      count: `select count(*)::int n from message_threads where status = 'closed' and reported_at is null and last_message_at < now() - make_interval(days => $1)`,
      remove: `delete from message_threads where status = 'closed' and reported_at is null and last_message_at < now() - make_interval(days => $1)` },
  ];
}

// A stored file that nothing refers to (an upload that was never attached, or left behind after something was deleted).
const ORPHANS = `from files f where f.created_at < now() - make_interval(days => $1)
  and not exists (select 1 from lesson_note_files x where x.file_id = f.id)
  and not exists (select 1 from assignment_files x where x.file_id = f.id)
  and not exists (select 1 from submission_files x where x.file_id = f.id)
  and not exists (select 1 from site_posts x where x.image_id = f.id)
  and not exists (select 1 from gallery_images x where x.file_id = f.id)`;

export async function preview() {
  const out = [];
  for (const r of rules()) out.push({ key: r.key, label: r.label, rule: r.rule, enabled: r.days !== null, count: r.days === null ? 0 : (await query(r.count, [r.days])).rows[0].n as number });
  const od = policy().orphanFileDays!;
  const orphans = (await query(`select count(*)::int n ${ORPHANS}`, [od])).rows[0].n as number;
  return { rules: out, files: { rule: `not attached to anything, uploaded more than ${od} days ago`, count: orphans, connected: storageDelete !== null } };
}

export async function run(actorId?: string, ip?: string) {
  const removed: Record<string, number> = {};
  for (const r of rules()) {
    if (r.days === null) continue;
    removed[r.key] = (await query(r.remove, [r.days])).rowCount ?? 0;
  }
  let filesRemoved = 0; let filesFailed = 0;
  if (storageDelete) {
    const od = policy().orphanFileDays!;
    const { rows } = await query(`select f.id, f.storage_key ${ORPHANS} limit 500`, [od]);
    for (const f of rows) {
      try { await storageDelete(f.storage_key); await query('delete from files where id = $1', [f.id]); filesRemoved++; }
      catch { filesFailed++; } // keep the database row so the next run tries again
    }
  }
  const result = { removed, files: { connected: storageDelete !== null, removed: filesRemoved, failed: filesFailed } };
  await audit({ actorId: (actorId ?? null) as any, action: 'data.retention_run', entityType: 'system', entityId: 'retention', metadata: result, ip });
  return result;
}

// ---- A person's data, for a data-access request ----
export async function exportPerson(email: string, actorId: string, ip?: string) {
  const u = (await query('select id, email, role, status, first_name, last_name, phone, created_at, last_login_at from users where email = $1', [email])).rows[0];
  if (!u) return null;
  const id = u.id as string; const q = async (sql: string) => (await query(sql, [id])).rows;
  const data = await withTransaction(async () => ({
    account: u,
    staffProfile: (await q('select staff_number from teacher_profiles where user_id = $1'))[0] ?? null,
    studentProfile: (await q('select admission_number, date_of_birth from student_profiles where user_id = $1'))[0] ?? null,
    parentProfile: (await q('select address from parent_profiles where user_id = $1'))[0] ?? null,
    guardianLinks: await q(`select 'as_parent' as direction, s.first_name || ' ' || s.last_name as other_person, ps.relationship, ps.is_primary from parent_students ps join users s on s.id = ps.student_id where ps.parent_id = $1
                            union all select 'as_student', p.first_name || ' ' || p.last_name, ps.relationship, ps.is_primary from parent_students ps join users p on p.id = ps.parent_id where ps.student_id = $1`),
    enrolments: await q(`select ac.name as session, c.stage || ' ' || c.year || coalesce(c.arm, '') as class, e.status from enrolments e join academic_sessions ac on ac.id = e.session_id join classes c on c.id = e.class_id where e.student_id = $1 order by ac.start_date`),
    scores: await q(`select ac.name as component, ac.max_score, sb.name as subject, sess.name as session, 'Term ' || t.term_number as term, s.score from scores s join assessment_components ac on ac.id = s.component_id join subjects sb on sb.id = s.subject_id join terms t on t.id = s.term_id join academic_sessions sess on sess.id = t.session_id where s.student_id = $1 order by t.start_date, sb.name`),
    attendance: await q(`select r.date, ar.status from attendance_records ar join attendance_registers r on r.id = ar.register_id where ar.student_id = $1 order by r.date`),
    submissions: await q(`select a.title as assignment, s.attempt, s.text_response, s.submitted_at, s.is_late, s.status, s.marks, s.feedback from submissions s join assignments a on a.id = s.assignment_id where s.student_id = $1 order by s.submitted_at`),
    invoices: await q('select number, due_date, status, created_at from invoices where student_id = $1 order by created_at'),
    notifications: await q('select type, title, body, created_at, read_at from notifications where user_id = $1 order by created_at'),
    messagesSent: await q('select th.subject, m.body, m.created_at from messages m join message_threads th on th.id = m.thread_id where m.sender_id = $1 order by m.created_at'),
    uploadedFiles: await q('select original_name, purpose, mime_type, size_bytes, created_at from files where owner_id = $1 order by created_at'),
    actionsTaken: await q('select action, entity_type, created_at from audit_logs where actor_id = $1 order by created_at desc limit 1000'),
  }));
  await audit({ actorId, action: 'data.person_exported', entityType: 'user', entityId: id, ip });
  return { exportedAt: new Date().toISOString(), note: 'Passwords and sign-in tokens are never included. Other people’s messages and other children’s data are not included.', ...data };
}
