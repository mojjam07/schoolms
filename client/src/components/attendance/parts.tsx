import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ExplanationRow } from '../../lib/types';

export const EXPLANATIONS_CHANGED = 'attendance-explanations-changed';

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>;
}

// Sub-navigation for the attendance area. The waiting count lets a form teacher or the office see at a glance that replies are due.
export function AttendanceTabs({ role }: { role: 'teacher' | 'admin' }) {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<ExplanationRow[]>('/attendance/explanations?status=pending').then((r) => { if (alive) setPending(r.length); }).catch(() => {});
    load(); window.addEventListener(EXPLANATIONS_CHANGED, load);
    return () => { alive = false; window.removeEventListener(EXPLANATIONS_CHANGED, load); };
  }, []);
  const base = `/${role}/attendance`;
  const tabs = role === 'admin'
    ? [{ to: base, label: 'Today', end: true }, { to: `${base}/register`, label: 'Take or correct a register' }, { to: `${base}/explanations`, label: 'Explanations' }, { to: `${base}/summary`, label: 'Class summaries' }]
    : [{ to: base, label: 'Register', end: true }, { to: `${base}/explanations`, label: 'Explanations' }, { to: `${base}/summary`, label: 'Class summary' }];
  return (
    <nav aria-label="Attendance sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-brand-500 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>
          {t.label}{t.label === 'Explanations' && pending > 0 ? <span className="ml-2 rounded-full bg-gold-400 px-1.5 py-0.5 text-xs font-bold text-brand-900" aria-label={`${pending} waiting`}>{pending}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}
