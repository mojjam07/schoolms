import { query, withTransaction } from '../../db/pool';
import { activationLink, createOneTimeToken } from '../auth/auth.service';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { audit } from '../../services/audit';
import { sendMail } from '../../services/mailer';
import { SCHOOL } from '../../config/school';

export const STATUS_LABEL: Record<string, string> = {
  received: 'Received', under_review: 'Under review', interview: 'Invited for an interview', offered: 'An offer has been made', declined: 'Not successful this time', withdrawn: 'Withdrawn',
};

// Records exactly what the email service said. "accepted" means it took the message, not that it was delivered.
async function mail(to: string, subject: string, text: string) {
  const r = await sendMail({ to, subject, text });
  return r.accepted ? 'accepted' : r.reason === 'no_provider' ? 'not_sent' : 'failed';
}

// ---------------- admission applications (public form) ----------------
export async function apply(i: any) {
  if (i.website) return { reference: null, emailAccepted: false, duplicate: false }; // a bot filled the hidden field: pretend, store nothing
  const dup = (await query(
    `select reference from admission_applications where guardian_email = $1 and lower(first_name) = lower($2) and lower(last_name) = lower($3) and date_of_birth = $4 and created_at > now() - interval '7 days'`,
    [i.guardianEmail, i.firstName, i.lastName, i.dateOfBirth])).rows[0];
  if (dup) return { reference: dup.reference as string, emailAccepted: false, duplicate: true };
  const { rows } = await query(
    `insert into admission_applications (first_name, last_name, date_of_birth, class_stage, class_year, previous_school, guardian_name, guardian_phone, guardian_email, address, message, consent_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()) returning id, reference`,
    [i.firstName, i.lastName, i.dateOfBirth, i.classStage, i.classYear, i.previousSchool || null, i.guardianName, i.guardianPhone, i.guardianEmail, i.address || null, i.message || null]);
  const status = await mail(i.guardianEmail, `We received ${i.firstName}'s application to ${SCHOOL.name}`,
    `Hello ${i.guardianName},\n\nThank you for applying to ${SCHOOL.name} for ${i.firstName} ${i.lastName} (${i.classStage} ${i.classYear}).\n\nYour reference is ${rows[0].reference}. Keep it safe: you will need it, with this email address, to check the progress of the application at ${env.CLIENT_ORIGIN}/admissions/status.\n\nThe school will be in touch.`);
  await query('update admission_applications set email_status = $2 where id = $1', [rows[0].id, status]);
  return { reference: rows[0].reference as string, emailAccepted: status === 'accepted', duplicate: false };
}

// The reference and the guardian's email must both match. Anything else gets the same answer, so nobody can probe for references.
export async function lookup(reference: string, email: string) {
  const r = (await query('select * from admission_applications where reference = $1 and guardian_email = $2', [reference, email])).rows[0];
  if (!r) throw new AppError(404, 'We could not find an application with that reference and email address. Check both and try again.', 'NOT_FOUND');
  return { reference: r.reference, applicantFirstName: r.first_name, applyingFor: `${r.class_stage} ${r.class_year}`, status: r.status, statusLabel: STATUS_LABEL[r.status], note: r.public_note, submittedAt: r.created_at, updatedAt: r.updated_at };
}

const appRow = (r: any, full = false) => ({
  id: r.id, reference: r.reference, applicantName: `${r.first_name} ${r.last_name}`, applyingFor: `${r.class_stage} ${r.class_year}`, status: r.status, statusLabel: STATUS_LABEL[r.status],
  guardianName: r.guardian_name, guardianEmail: r.guardian_email, guardianPhone: r.guardian_phone, submittedAt: r.created_at, emailStatus: r.email_status,
  ...(full ? { dateOfBirth: r.date_of_birth, previousSchool: r.previous_school, address: r.address, message: r.message, publicNote: r.public_note, adminNote: r.admin_note, decidedAt: r.decided_at, consentAt: r.consent_at } : {}),
  convertedStudentId: r.converted_student_id ?? null,
});
export async function listApplications(f: { status?: string; q?: string; page: number; pageSize: number }) {
  const params = [f.status ?? null, f.q ? `%${f.q}%` : null];
  const where = `($1::text is null or status = $1) and ($2::text is null or first_name || ' ' || last_name ilike $2 or reference ilike $2 or guardian_email ilike $2 or guardian_name ilike $2)`;
  const total = (await query(`select count(*)::int as n from admission_applications where ${where}`, params)).rows[0].n as number;
  const { rows } = await query(`select * from admission_applications where ${where} order by created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, params);
  return { items: rows.map((r) => appRow(r)), total, page: f.page, pageSize: f.pageSize };
}
export async function getApplication(id: string) {
  const r = (await query('select * from admission_applications where id = $1', [id])).rows[0];
  if (!r) throw new AppError(404, 'Application not found', 'NOT_FOUND');
  return appRow(r, true);
}
export async function setApplicationStatus(id: string, i: { status: string; publicNote?: string; adminNote?: string }, actorId: string, ip?: string) {
  const cur = (await query('select * from admission_applications where id = $1', [id])).rows[0];
  if (!cur) throw new AppError(404, 'Application not found', 'NOT_FOUND');
  const changed = cur.status !== i.status;
  await query(
    `update admission_applications set status = $2, public_note = coalesce($3, public_note), admin_note = coalesce($4, admin_note),
            decided_at = case when $2 in ('offered', 'declined') then coalesce(decided_at, now()) else decided_at end, updated_at = now() where id = $1`,
    [id, i.status, i.publicNote ?? null, i.adminNote ?? null]);
  await audit({ actorId, action: 'application.status_set', entityType: 'application', entityId: id, metadata: { from: cur.status, to: i.status }, ip });
  if (changed) {
    const note = i.publicNote ?? cur.public_note;
    const status = await mail(cur.guardian_email, `Update on ${cur.first_name}'s application to ${SCHOOL.name}`,
      `Hello ${cur.guardian_name},\n\nThe status of ${cur.first_name} ${cur.last_name}'s application (${cur.reference}) is now: ${STATUS_LABEL[i.status]}.${note ? `\n\n${note}` : ''}\n\nYou can check it any time at ${env.CLIENT_ORIGIN}/admissions/status with your reference and this email address.`);
    await query('update admission_applications set email_status = $2 where id = $1', [id, status]);
  }
  return getApplication(id);
}

// ---------------- contact messages ----------------
export async function sendMessage(i: any) {
  if (i.website) return { received: true };
  await query('insert into contact_messages (name, email, phone, subject, message, consent_at) values ($1,$2,$3,$4,$5, now())', [i.name, i.email, i.phone ?? null, i.subject, i.message]);
  return { received: true };
}
export async function listMessages(f: { status?: string; page: number; pageSize: number }) {
  const total = (await query('select count(*)::int as n from contact_messages where ($1::text is null or status = $1)', [f.status ?? null])).rows[0].n as number;
  const { rows } = await query(`select * from contact_messages where ($1::text is null or status = $1) order by created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`, [f.status ?? null]);
  return { items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, status: r.status, receivedAt: r.created_at })), total, page: f.page, pageSize: f.pageSize };
}
export async function setMessageStatus(id: string, status: string, actorId: string, ip?: string) {
  const { rowCount } = await query('update contact_messages set status = $2 where id = $1', [id, status]);
  if (!rowCount) throw new AppError(404, 'Message not found', 'NOT_FOUND');
  await audit({ actorId, action: 'contact_message.status_set', entityType: 'contact_message', entityId: id, metadata: { status }, ip });
  return { updated: true };
}

// Turns an applicant who has been made an offer into a student account in one step. The application is never edited by hand:
// the link to the new student is stored, so it cannot be converted twice.
export async function convertApplication(id: string, i: { email: string; admissionNumber: string; classId?: string; createParent: boolean }, actorId: string, ip?: string) {
  const made = await withTransaction(async (c) => {
    const a = (await c.query('select * from admission_applications where id = $1 for update', [id])).rows[0];
    if (!a) throw new AppError(404, 'Application not found', 'NOT_FOUND');
    if (a.converted_student_id) throw new AppError(409, 'This applicant has already been made a student.', 'ALREADY_CONVERTED');
    if (a.status !== 'offered') throw new AppError(409, 'Set the status to "Offer made" before creating the student account.', 'NOT_OFFERED');
    let sessionId: string | null = null;
    if (i.classId) {
      const cls = (await c.query('select stage, year from classes where id = $1', [i.classId])).rows[0];
      if (!cls) throw new AppError(404, 'Class not found', 'NOT_FOUND');
      if (cls.stage !== a.class_stage || cls.year !== a.class_year) throw new AppError(400, `This applicant applied for ${a.class_stage} ${a.class_year}. Choose a ${a.class_stage} ${a.class_year} class.`, 'VALIDATION_ERROR');
      sessionId = (await c.query('select id from academic_sessions where is_current')).rows[0]?.id ?? null;
      if (!sessionId) throw new AppError(400, 'There is no current session to place the student in. Set one under Sessions and terms.', 'VALIDATION_ERROR');
    }
    let studentId: string;
    try {
      studentId = (await c.query(`insert into users (email, role, first_name, last_name) values ($1,'student',$2,$3) returning id`, [i.email, a.first_name, a.last_name])).rows[0].id;
      await c.query('insert into student_profiles (user_id, admission_number, date_of_birth) values ($1,$2,$3)', [studentId, i.admissionNumber, a.date_of_birth]);
    } catch (e: any) {
      if (e?.code === '23505') throw new AppError(409, String(e.constraint).includes('admission') ? 'That admission number is already used.' : 'That email address already belongs to another account.', 'DUPLICATE');
      throw e;
    }
    if (i.classId && sessionId) await c.query('insert into enrolments (student_id, class_id, session_id) values ($1,$2,$3)', [studentId, i.classId, sessionId]);

    // The guardian: link an existing parent account with that email, or (if asked) create one.
    let parentNote: 'linked' | 'created' | 'none' | 'email_belongs_to_other_role' = 'none';
    let parentId: string | null = null; let parentToken: string | null = null;
    const existing = (await c.query('select id, role from users where email = $1', [a.guardian_email])).rows[0];
    if (existing) { if (existing.role === 'parent') { parentId = existing.id; parentNote = 'linked'; } else parentNote = 'email_belongs_to_other_role'; }
    else if (i.createParent) {
      const parts = String(a.guardian_name).trim().split(/\s+/); const first = parts[0]; const last = parts.slice(1).join(' ') || parts[0];
      parentId = (await c.query(`insert into users (email, role, first_name, last_name, phone) values ($1,'parent',$2,$3,$4) returning id`, [a.guardian_email, first, last, a.guardian_phone])).rows[0].id;
      await c.query('insert into parent_profiles (user_id, address) values ($1,$2)', [parentId, a.address]);
      parentToken = await createOneTimeToken(c, parentId!, 'activation', 72); parentNote = 'created';
    }
    if (parentId) await c.query(`insert into parent_students (parent_id, student_id, relationship, is_primary, created_by) values ($1,$2,'guardian',true,$3) on conflict do nothing`, [parentId, studentId, actorId]);
    const studentToken = await createOneTimeToken(c, studentId, 'activation', 72);
    await c.query('update admission_applications set converted_student_id = $2, updated_at = now() where id = $1', [id, studentId]);
    await audit({ actorId, action: 'application.converted', entityType: 'application', entityId: id, metadata: { studentId, parent: parentNote, enrolled: !!i.classId }, ip }, c);
    return { studentId, studentToken, parentToken, parentNote, a };
  });
  const send = async (to: string, name: string, token: string) => (await sendMail({ to, subject: 'Activate your Kingdom of Knowledge account', text: `Hello ${name},\n\nAn account has been created for you. Set your password within 72 hours:\n${activationLink(token)}` })).accepted;
  return {
    studentId: made.studentId, parent: made.parentNote,
    studentEmailAccepted: await send(i.email, made.a.first_name, made.studentToken),
    parentEmailAccepted: made.parentToken ? await send(made.a.guardian_email, made.a.guardian_name, made.parentToken) : null,
  };
}
