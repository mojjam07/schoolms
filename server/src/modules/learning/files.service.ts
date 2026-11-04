import crypto from 'crypto';
import { pool, query, Queryable } from '../../db/pool';
import { AppError } from '../../utils/AppError';
import { storage } from '../../services/storage';
import type { Role } from '../users/roles';

export const MAX_BYTES = 10 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};
export const ALLOWED_EXTENSIONS = Object.keys(MIME);

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const startsWith = (b: Buffer, sig: Buffer) => b.length >= sig.length && b.subarray(0, sig.length).equals(sig);

// The file's own bytes must match its extension; the browser-supplied type is never trusted.
function contentMatches(ext: string, b: Buffer): boolean {
  switch (ext) {
    case 'pdf': return b.subarray(0, 1024).includes('%PDF-');
    case 'doc': case 'ppt': return startsWith(b, OLE);
    case 'docx': return startsWith(b, ZIP) && b.includes('word/');
    case 'pptx': return startsWith(b, ZIP) && b.includes('ppt/');
    case 'jpg': case 'jpeg': return startsWith(b, Buffer.from([0xff, 0xd8, 0xff]));
    case 'png': return startsWith(b, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    default: return false;
  }
}

const cleanName = (raw: string) => {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8'); // multer decodes names as latin1
  const base = (utf8.includes('\uFFFD') ? raw : utf8).split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[\u0000-\u001f"<>:*?|]/g, '').trim().slice(0, 120) || 'file';
};

export async function saveUpload(
  ownerId: string, purpose: 'resource' | 'assignment' | 'submission' | 'public',
  file: { originalname: string; buffer: Buffer; size: number },
) {
  const name = cleanName(file.originalname);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!MIME[ext]) throw new AppError(400, 'This file type is not allowed. Use PDF, Word, PowerPoint, JPG or PNG.', 'BAD_FILE_TYPE');
  // Pictures for the public website must be plain images: nothing else is ever served to the open internet.
  if (purpose === 'public' && !['jpg', 'jpeg', 'png'].includes(ext)) throw new AppError(400, 'Website pictures must be JPG or PNG.', 'BAD_FILE_TYPE');
  if (!file.size) throw new AppError(400, 'The file is empty.', 'BAD_FILE');
  if (!contentMatches(ext, file.buffer)) throw new AppError(400, `This file does not look like a real .${ext} file.`, 'BAD_FILE_TYPE');

  const key = `${purpose}/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, file.buffer, MIME[ext]);
  try {
    const { rows } = await pool.query(
      `insert into files (owner_id, purpose, original_name, mime_type, size_bytes, storage_key) values ($1,$2,$3,$4,$5,$6)
       returning id, original_name, mime_type, size_bytes`, [ownerId, purpose, name, MIME[ext], file.size, key]);
    return fileRow(rows[0]);
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

export const fileRow = (r: any) => ({ id: r.id, name: r.original_name, mimeType: r.mime_type, sizeBytes: r.size_bytes });

// Tables that can hold a reference to a file. A file with no references left is an orphan and is deleted.
const ATTACHMENT_TABLES: [string, string][] = [['lesson_note_files', 'file_id'], ['assignment_files', 'file_id'], ['submission_files', 'file_id'], ['gallery_images', 'file_id'], ['site_posts', 'image_id']];

export async function deleteIfOrphaned(fileIds: string[]) {
  for (const id of fileIds) {
    const used = await Promise.all(ATTACHMENT_TABLES.map(([t, col]) => query(`select 1 from ${t} where ${col} = $1 limit 1`, [id])));
    if (used.some((u) => u.rowCount)) continue;
    const { rows } = await query('delete from files where id = $1 returning storage_key', [id]);
    if (rows[0]) await storage.remove(rows[0].storage_key).catch((e) => console.error('[storage] cleanup failed', e.message));
  }
}

// Files the teacher uploaded themselves and may attach to their own material.
export async function assertOwnedFiles(db: Queryable, ownerId: string, fileIds: string[], purpose: string) {
  if (!fileIds.length) return;
  const { rows } = await db.query('select id from files where id = any($1::uuid[]) and owner_id = $2 and purpose = $3', [fileIds, ownerId, purpose]);
  if (rows.length !== new Set(fileIds).size) throw new AppError(400, 'One of the attached files was not found. Upload it again.', 'BAD_FILE_REFERENCE');
}

// A student's active enrolment in the class and session an item was shared with.
const studentInClass = (item: string) => `exists (
    select 1 from enrolments e join academic_sessions s on s.id = e.session_id and s.is_current
     where e.student_id = $2 and e.status = 'active' and e.class_id = ${item}.class_id and e.session_id = ${item}.session_id)`;

// Who may download a file: its owner, an administrator, a student in the class a published note or assignment was
// shared with, or the teacher who set the assignment a student's work was handed in to.
export async function canDownload(user: { id: string; role: Role }, file: { id: string; owner_id: string }) {
  if (user.role === 'admin' || file.owner_id === user.id) return true;
  if (user.role === 'student') {
    const note = await query(
      `select 1 from lesson_note_files lf join lesson_notes n on n.id = lf.note_id and n.status = 'published'
        where lf.file_id = $1 and ${studentInClass('n')} limit 1`, [file.id, user.id]);
    if (note.rowCount) return true;
    const asg = await query(
      `select 1 from assignment_files af join assignments a on a.id = af.assignment_id
        where af.file_id = $1 and a.status in ('published', 'closed') and (a.publish_at is null or a.publish_at <= now())
          and ${studentInClass('a')} limit 1`, [file.id, user.id]);
    return !!asg.rowCount;
  }
  if (user.role === 'teacher') {
    const { rowCount } = await query(
      `select 1 from submission_files sf join submissions sb on sb.id = sf.submission_id
         join assignments a on a.id = sb.assignment_id where sf.file_id = $1 and a.teacher_id = $2 limit 1`, [file.id, user.id]);
    return !!rowCount;
  }
  return false;
}

export async function loadForDownload(user: { id: string; role: Role }, fileId: string) {
  const { rows } = await query('select * from files where id = $1', [fileId]);
  const f = rows[0];
  // Same answer for "missing" and "not allowed" so file IDs cannot be probed.
  if (!f || !(await canDownload(user, f))) throw new AppError(404, 'File not found', 'NOT_FOUND');
  return { file: f, data: await storage.get(f.storage_key) };
}
