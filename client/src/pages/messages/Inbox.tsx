import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  DataState,
  Empty,
  PageHeader,
  Select,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import type { MessageThreadSummary, Paged } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

// Shared by the parent, teacher and administrator portals. `base` is '/parent', '/teacher' or '/admin'.
export default function MessagesInbox({
  base,
  canStart = true,
}: {
  base: string;
  canStart?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useFetch<Paged<MessageThreadSummary>>(
    `/messages/threads?page=${page}${status ? `&status=${status}` : ""}`,
  );
  return (
    <>
      <PageHeader
        title="Messages"
        intro={
          base === "/admin"
            ? "Conversations sent to the school office."
            : base === "/parent"
              ? "Write to your child’s teachers or to the school office."
              : "Conversations with parents and guardians of pupils you teach."
        }
      />
      {canStart && (
        <p className="mb-4">
          <Link
            to={`${base}/messages/new`}
            className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white"
          >
            New message
          </Link>
        </p>
      )}
      <div className="mb-4 max-w-xs">
        <Select
          label="Show"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All conversations</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
      </div>
      <DataState loading={list.loading} error={list.error}>
        {list.data && list.data.items.length === 0 ? (
          <Empty>No conversations yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {list.data?.items.map((t) => (
              <li key={t.id}>
                <Link
                  to={`${base}/messages/${t.id}`}
                  className="block rounded-xl border border-line bg-white p-4 hover:border-brand-700"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className={t.unread ? "font-semibold" : "font-medium"}>
                      {t.subject}
                    </p>
                    <div className="flex gap-2">
                      {t.unread && <Badge tone="good">New</Badge>}
                      {t.status === "closed" && <Badge>Closed</Badge>}
                    </div>
                  </div>
                  <p className="text-sm text-muted">
                    About {t.studentName} ·{" "}
                    {base === "/parent" ? t.staffName : t.parentName} ·{" "}
                    {fmtDateTime(t.lastMessageAt)}
                  </p>
                  {t.lastSnippet && (
                    <p className="mt-1 truncate text-sm text-muted">
                      {t.lastSnippet}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.data && list.data.total > list.data.pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded border border-line px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(list.data.total / list.data.pageSize)}
            </span>
            <button
              disabled={page * list.data.pageSize >= list.data.total}
              onClick={() => setPage(page + 1)}
              className="rounded border border-line px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </DataState>
    </>
  );
}
