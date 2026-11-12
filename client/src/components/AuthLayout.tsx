import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="flex flex-col justify-between bg-brand-500 p-8 text-white lg:p-14">
        <Link to="/" className="font-display text-2xl font-bold">
          [School Name]
        </Link>
        <div className="hidden lg:block">
          <p className="font-display text-4xl font-bold leading-tight">
            Learning, results and fees in one place for students, teachers and
            parents.
          </p>
          <div className="mt-8 h-1.5 w-24 rounded-full bg-gold-400" />
        </div>
        <address className="text-sm not-italic text-brand-100">
          [School Address]
        </address>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          {intro && <p className="mt-2 text-muted">{intro}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
