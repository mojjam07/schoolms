import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../../components/ui";
import { mediaSrc } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import type { PubEvent, PubPost } from "../../lib/types";

export const Page = ({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) => (
  <div className="mx-auto max-w-5xl px-5 py-10">
    <h1 className="font-display text-4xl font-bold">{title}</h1>
    {intro && <p className="mt-3 max-w-3xl text-lg text-muted">{intro}</p>}
    <div className="mt-8 space-y-10">{children}</div>
  </div>
);
export const Block = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section>
    <h2 className="mb-3 font-display text-2xl font-bold">{title}</h2>
    <div className="space-y-3 leading-relaxed">{children}</div>
  </section>
);
export const Loading = ({
  error,
  loading,
}: {
  error: string;
  loading: boolean;
}) =>
  error ? (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Alert tone="error">{error}</Alert>
    </div>
  ) : loading ? (
    <p className="mx-auto max-w-5xl px-5 py-10 text-muted">Loading…</p>
  ) : null;

export function PostCard({ p }: { p: PubPost }) {
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-white">
      {p.imageUrl && (
        <img
          src={mediaSrc(p.imageUrl)}
          alt={p.imageAlt}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="p-4">
        <p className="text-sm text-muted">
          {fmtDateTime(p.publishedAt).split(",").slice(0, 2).join(",")}
        </p>
        <h3 className="mt-1 font-display text-xl font-bold">
          <Link className="hover:underline" to={`/news/${p.slug}`}>
            {p.title}
          </Link>
        </h3>
        {p.summary && <p className="mt-2 text-muted">{p.summary}</p>}
      </div>
    </li>
  );
}
export function EventItem({ e }: { e: PubEvent }) {
  const d = new Date(e.startsAt);
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-white p-4">
      <div className="w-16 shrink-0 rounded-lg bg-brand-50 py-2 text-center text-brand-900">
        <div className="text-xs font-semibold uppercase">
          {d.toLocaleString("en-NG", { month: "short" })}
        </div>
        <div className="text-2xl font-bold leading-none">{d.getDate()}</div>
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold">{e.title}</h3>
        <p className="text-sm text-muted">
          {fmtDateTime(e.startsAt)}
          {e.location ? ` · ${e.location}` : ""}
        </p>
        {e.description && (
          <p className="mt-1 whitespace-pre-line text-sm">{e.description}</p>
        )}
      </div>
    </li>
  );
}
