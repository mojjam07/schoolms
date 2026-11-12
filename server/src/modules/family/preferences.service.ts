import { query, withTransaction } from '../../db/pool';

export const CATEGORIES = [
  { key: 'messages', label: 'Messages from parents and staff' },
  { key: 'fees', label: 'School fees: invoices, reminders and receipts' },
  { key: 'results', label: 'Results and report cards' },
  { key: 'attendance', label: 'Attendance and absence replies' },
  { key: 'assignments', label: 'Assignments, lesson notes and marks' },
  { key: 'schedule', label: 'Timetable and examination changes' },
  { key: 'announcements', label: 'School announcements' },
] as const;
export type Category = typeof CATEGORIES[number]['key'];

export async function getPreferences(userId: string) {
  const rows = (await query('select category, in_app, email from notification_preferences where user_id = $1', [userId])).rows;
  return {
    categories: CATEGORIES.map((c) => { const r = rows.find((x) => x.category === c.key); return { key: c.key, label: c.label, inApp: r ? r.in_app : true, email: r ? r.email : true }; }),
    alwaysOn: 'Account and security messages (activation, password reset, sign-in alerts) are always sent.',
  };
}

export async function savePreferences(userId: string, prefs: { category: Category; inApp: boolean; email: boolean }[]) {
  await withTransaction(async (c) => {
    for (const p of prefs) {
      await c.query(
        `insert into notification_preferences (user_id, category, in_app, email) values ($1,$2,$3,$4)
         on conflict (user_id, category) do update set in_app = excluded.in_app, email = excluded.email, updated_at = now()`, [userId, p.category, p.inApp, p.email]);
    }
  });
  return getPreferences(userId);
}

// ---- For the code that SENDS notifications and emails ----
// Maps a notification `type` string to one of the categories above. Types that match none are "general" and are always delivered.
// This is a guess from common names: check it against the types your project really uses.
export function categoryOfType(type: string): Category | null {
  if (/message/i.test(type)) return 'messages';
  if (/fee|invoice|payment|receipt|paystack/i.test(type)) return 'fees';
  if (/result|report/i.test(type)) return 'results';
  if (/attend|absen/i.test(type)) return 'attendance';
  if (/assign|submission|lesson|note|mark|grade/i.test(type)) return 'assignments';
  if (/exam|timetable|schedule/i.test(type)) return 'schedule';
  if (/announce|news/i.test(type)) return 'announcements';
  return null;
}
// Call before creating an in-app notification or sending an email: `if (!(await wants(userId, type, 'email'))) return;`
export async function wants(userId: string, type: string, channel: 'in_app' | 'email'): Promise<boolean> {
  const cat = categoryOfType(type);
  if (!cat) return true;
  const r = (await query('select in_app, email from notification_preferences where user_id = $1 and category = $2', [userId, cat])).rows[0];
  return r ? (channel === 'in_app' ? r.in_app : r.email) : true;
}
