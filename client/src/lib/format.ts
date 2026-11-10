export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

// <input type="datetime-local"> works in the browser's own time zone, so convert both ways.
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const fileSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function dueText(iso: string) {
  const ms = new Date(iso).getTime() - Date.now(); const days = Math.round(Math.abs(ms) / 864e5);
  if (ms < 0) return days < 1 ? 'Overdue' : `Overdue by ${days} day${days > 1 ? 's' : ''}`;
  return ms < 864e5 ? 'Due in less than a day' : `Due in ${days} day${days > 1 ? 's' : ''}`;
}

const OK_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];
export function checkFile(f: File): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!OK_EXT.includes(ext)) return 'This file type is not allowed. Use PDF, Word, PowerPoint, JPG or PNG.';
  if (f.size > 10 * 1024 * 1024) return 'That file is larger than 10 MB. Please choose a smaller file.';
  return null;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? 's' : ''} ago`; }
  return fmtDateTime(iso);
}

// Money is whole kobo everywhere except what people type and read.
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const toKobo = (text: string): number | null => {
  const t = text.replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
};
export const nairaInput = (kobo: number) => (kobo / 100).toFixed(2);
export const fmtDate = (d: string | null) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function checkImage(f: File): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['jpg', 'jpeg', 'png'].includes(ext)) return 'Website pictures must be JPG or PNG.';
  if (f.size > 10 * 1024 * 1024) return 'That picture is larger than 10 MB. Please choose a smaller one.';
  return null;
}

export const ordinal = (n: number | null) => {
  if (n === null) return '-';
  const v = n % 100; const s = ['th', 'st', 'nd', 'rd'];
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
export const gradeFor = (bands: { minPercent: number; grade: string }[], percent: number) => {
  const p = Math.round(percent * 100) / 100;
  return [...bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => b.minPercent <= p)?.grade ?? null;
};
export const num = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '-' : String(Math.round(n * 10 ** digits) / 10 ** digits));

// Attendance dates are Lagos calendar days (YYYY-MM-DD), the same as the API.
export const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
export const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDayLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
