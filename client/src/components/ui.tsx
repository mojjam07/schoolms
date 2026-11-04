import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({ label, error, hint, ...props }: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${error ? 'border-red-600' : 'border-line'}`}
        {...props}
      />
      {(error || hint) && (
        <p id={`${id}-msg`} className={`mt-1.5 text-sm ${error ? 'text-red-700' : 'text-muted'}`}>{error ?? hint}</p>
      )}
    </div>
  );
}

export function Button({ loading, children, ...props }: { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function Alert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const cls = tone === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-brand-200 bg-brand-50 text-brand-900';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3.5 py-3 text-sm ${cls}`}>{children}</div>;
}

import type { SelectHTMLAttributes } from 'react';

export function Select({ label, error, children, ...props }: { label: string; error?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <select id={id} aria-invalid={!!error}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${error ? 'border-red-600' : 'border-line'}`}
        {...props}>{children}</select>
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-white p-5">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-xl font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      {intro && <p className="mt-1 max-w-2xl text-muted">{intro}</p>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  const cls = { neutral: 'bg-gray-100 text-gray-800', good: 'bg-brand-100 text-brand-900', warn: 'bg-gold-100 text-yellow-900', bad: 'bg-red-100 text-red-900' }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function SmallButton({ tone = 'plain', ...props }: { tone?: 'plain' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = tone === 'danger' ? 'border-red-300 text-red-800 hover:bg-red-50' : 'border-line text-ink hover:bg-brand-50';
  return <button {...props} className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${cls}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function DataState({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  if (loading) return <p className="py-6 text-sm text-muted">Loading…</p>;
  return <>{children}</>;
}

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm">{children}</table></div>
);
export const Th = ({ children }: { children?: ReactNode }) => <th className="border-b border-line px-3 py-2 font-semibold text-muted">{children}</th>;
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`border-b border-line/60 px-3 py-2.5 align-middle ${className}`}>{children}</td>;

import type { TextareaHTMLAttributes } from 'react';

export function TextArea({ label, error, hint, ...props }: { label: string; error?: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <textarea id={id} aria-invalid={!!error} rows={6}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${error ? 'border-red-600' : 'border-line'}`} {...props} />
      {(error || hint) && <p className={`mt-1.5 text-sm ${error ? 'text-red-700' : 'text-muted'}`}>{error ?? hint}</p>}
    </div>
  );
}
