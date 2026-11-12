import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useUnreadCount } from "../lib/useUnread";

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  badge?: number;
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span
      aria-label={`${n} unread`}
      className="ml-2 inline-block min-w-[1.4rem] rounded-full bg-gold-400 px-1.5 py-0.5 text-center text-xs font-bold text-brand-900"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export default function PortalLayout({
  roleLabel,
  nav,
  notificationsPath,
}: {
  roleLabel: string;
  nav: NavItem[];
  notificationsPath?: string;
}) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount(!!notificationsPath);
  const items: NavItem[] = notificationsPath
    ? [...nav, { to: notificationsPath, label: "Notifications", badge: unread }]
    : nav;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-2 border-b-4 border-gold-400 bg-brand-500 px-4 py-3 text-white lg:hidden">
        <span className="min-w-0 font-display text-base font-bold leading-tight">
          [School Name]
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {notificationsPath && (
            <NavLink
              to={notificationsPath}
              className="whitespace-nowrap rounded-md border border-white/60 px-3 py-1.5 text-sm font-medium"
            >
              Notices
              <Badge n={unread} />
            </NavLink>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="portal-nav"
            className="whitespace-nowrap rounded-md border border-white/60 px-3 py-1.5 text-sm font-medium"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      <aside
        id="portal-nav"
        className={`${open ? "block" : "hidden"} flex-col bg-brand-700 text-white lg:sticky lg:top-0 lg:flex lg:h-screen`}
      >
        <div className="hidden border-b-4 border-gold-400 px-5 py-5 lg:block">
          <p className="font-display text-xl font-bold leading-tight">
            [School Name]
          </p>
          <p className="mt-1 text-sm text-brand-100">{roleLabel}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-gold-400 text-brand-900" : "text-brand-100 hover:bg-white/10"}`
              }
            >
              <span>{n.label}</span>
              {n.badge ? (
                <span
                  aria-label={`${n.badge} unread`}
                  className="min-w-[1.4rem] rounded-full bg-gold-400 px-1.5 py-0.5 text-center text-xs font-bold text-brand-900"
                >
                  {n.badge > 99 ? "99+" : n.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/20 p-4 text-sm">
          <p className="truncate font-medium">
            {user?.firstName} {user?.lastName}
          </p>
          <button
            onClick={logout}
            className="mt-2 rounded-md border border-white/60 px-3 py-1.5 font-medium hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 p-5 sm:p-8">
        <Outlet />
      </main>
    </div>
  );
}
