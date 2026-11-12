import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Card,
  DataState,
  Empty,
  PageHeader,
  SmallButton,
} from "../components/ui";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NotificationItem, NotificationList } from "../lib/types";
import { useAction, useFetch } from "../lib/useFetch";
import { NOTIFICATIONS_CHANGED } from "../lib/useUnread";

// One page for every role: each person only ever receives their own notifications from the server.
export default function Notifications() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [size, setSize] = useState(30);
  const list = useFetch<NotificationList>(
    `/notifications?pageSize=${size}${unreadOnly ? "&unread=true" : ""}`,
  );
  const act = useAction();
  // Keep the open list fresh, the same way the menu badge is kept fresh.
  useEffect(() => {
    const refresh = () => list.reload();
    window.addEventListener("focus", refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [list.reload]);
  const changed = () => {
    list.reload();
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  };

  async function open(n: NotificationItem) {
    if (!n.read)
      await act.run(() =>
        api(`/notifications/${n.id}/read`, { method: "POST", body: {} }),
      );
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    if (n.link) navigate(n.link);
    else list.reload();
  }
  async function markAll() {
    if (
      await act.run(() =>
        api("/notifications/read-all", { method: "POST", body: {} }),
      )
    )
      changed();
  }

  const d = list.data;
  return (
    <>
      <PageHeader
        title="Notifications"
        intro="Updates from your school: new work, marks, lessons and reminders."
      />
      {act.error && (
        <div className="mb-4">
          <Alert tone="error">{act.error}</Alert>
        </div>
      )}
      <Card
        title={d ? `${d.unreadCount} unread` : "Notifications"}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-500"
                checked={unreadOnly}
                onChange={(e) => {
                  setUnreadOnly(e.target.checked);
                  setSize(30);
                }}
              />
              Unread only
            </label>
            <SmallButton
              onClick={markAll}
              disabled={act.busy || !d?.unreadCount}
            >
              Mark all as read
            </SmallButton>
          </div>
        }
      >
        <DataState loading={list.loading && !d} error={list.error}>
          {d?.items.length ? (
            <>
              <ul className="divide-y divide-line">
                {d.items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => open(n)}
                      className={`flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-brand-50 ${n.read ? "" : "bg-brand-50/60"}`}
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-500"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block break-words ${n.read ? "" : "font-semibold"}`}
                        >
                          {n.title}
                          {!n.read && (
                            <span className="sr-only"> (unread)</span>
                          )}
                        </span>
                        {n.body && (
                          <span className="block break-words text-sm text-muted">
                            {n.body}
                          </span>
                        )}
                        <span className="block text-xs text-muted">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {d.total > d.items.length && (
                <div className="mt-4">
                  <SmallButton onClick={() => setSize((s) => s + 30)}>
                    Show older notifications
                  </SmallButton>
                </div>
              )}
            </>
          ) : (
            <Empty>
              {unreadOnly
                ? "You have no unread notifications."
                : "No notifications yet. New work, marks and reminders will appear here."}
            </Empty>
          )}
        </DataState>
      </Card>
    </>
  );
}
