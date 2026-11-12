import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataState,
  PageHeader,
  SmallButton,
  TextArea,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import type { MessageThreadDetail } from "../../lib/types";
import { useAction, useFetch } from "../../lib/useFetch";

export default function MessageThread({
  base,
}: {
  base: "/parent" | "/teacher" | "/admin";
}) {
  const { id } = useParams();
  const t = useFetch<MessageThreadDetail>(`/messages/threads/${id}`);
  const send = useAction();
  const other = useAction();
  const [text, setText] = useState("");
  const isAdmin = base === "/admin";
  const post = async () => {
    if (
      await send.run(() =>
        api(`/messages/threads/${id}/messages`, { body: { body: text } }),
      )
    ) {
      setText("");
      t.reload();
    }
  };
  const setStatus = async (status: string) => {
    if (
      await other.run(() =>
        api(`/messages/threads/${id}/status`, {
          method: "PATCH",
          body: { status },
        }),
      )
    )
      t.reload();
  };
  const report = async (mid: string) => {
    const reason = window.prompt(
      "Why are you reporting this message? The administrators will review it.",
    );
    if (
      reason &&
      reason.trim().length >= 3 &&
      (await other.run(() =>
        api(`/messages/messages/${mid}/report`, {
          body: { reason: reason.trim() },
        }),
      ))
    )
      t.reload();
  };
  const hide = async (mid: string, hidden: boolean) => {
    const reason = hidden
      ? (window.prompt(
          "Reason for removing this message (kept for the record):",
        ) ?? undefined)
      : undefined;
    if (hidden && !reason) return;
    if (
      await other.run(() =>
        api(`/messages/admin/messages/${mid}/hide`, {
          body: { hidden, reason },
        }),
      )
    )
      t.reload();
  };
  return (
    <>
      <p className="mb-2 text-sm">
        <Link to={`${base}/messages`} className="text-brand-700 underline">
          ← All messages
        </Link>
      </p>
      <DataState loading={t.loading} error={t.error}>
        {t.data && (
          <>
            <PageHeader
              title={t.data.subject}
              intro={`About ${t.data.studentName} · ${t.data.parentName} and ${t.data.staffName}`}
            />
            {t.data.side === "oversight" && (
              <div className="mb-3">
                <Alert tone="success">
                  You are reviewing this conversation as an administrator. This
                  view is recorded in the audit log.
                </Alert>
              </div>
            )}
            {other.error && (
              <div className="mb-3">
                <Alert tone="error">{other.error}</Alert>
              </div>
            )}
            <ul className="space-y-3">
              {t.data.messages.map((m) => (
                <li
                  key={m.id}
                  className={`max-w-2xl rounded-xl border border-line p-4 ${m.mine ? "ml-auto bg-brand-50" : "bg-white"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {m.mine ? "You" : m.senderName} ·{" "}
                      {fmtDateTime(m.createdAt)}
                    </span>
                    {m.reported && <Badge tone="warn">Reported</Badge>}
                  </div>
                  {m.removed && m.body === null ? (
                    <p className="mt-2 text-sm italic text-muted">
                      This message was removed by the school.
                    </p>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {m.removed && (
                        <span className="mr-2 italic text-muted">
                          [removed]
                        </span>
                      )}
                      {m.body}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {!m.mine && !isAdmin && !m.removed && (
                      <SmallButton onClick={() => report(m.id)}>
                        Report
                      </SmallButton>
                    )}
                    {isAdmin && (
                      <SmallButton onClick={() => hide(m.id, !m.removed)}>
                        {m.removed ? "Restore" : "Remove from view"}
                      </SmallButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {t.data.canReply ? (
              <Card>
                <div className="mt-2 space-y-3">
                  {send.error && <Alert tone="error">{send.error}</Alert>}
                  <TextArea
                    label="Reply"
                    rows={4}
                    maxLength={4000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <Button
                    onClick={post}
                    loading={send.busy}
                    disabled={!text.trim()}
                  >
                    Send reply
                  </Button>
                </div>
              </Card>
            ) : (
              t.data.side !== "oversight" && (
                <p className="mt-4 text-sm text-muted">
                  This conversation is closed.
                </p>
              )
            )}
            {t.data.canClose && (
              <div className="mt-4">
                <SmallButton
                  onClick={() =>
                    setStatus(t.data!.status === "open" ? "closed" : "open")
                  }
                >
                  {t.data.status === "open"
                    ? "Close conversation"
                    : "Reopen conversation"}
                </SmallButton>
              </div>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
