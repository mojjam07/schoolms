import { useMemo } from "react";
import type { Session, Term } from "./types";
import { useFetch } from "./useFetch";

// All terms, newest first, with a readable label and the current term as the default pick.
export function useTerms() {
  const sessions = useFetch<Session[]>("/academic/sessions");
  const termsQ = useFetch<Term[]>("/academic/terms");
  const terms = useMemo(
    () =>
      [...(termsQ.data ?? [])].sort((a, b) =>
        b.startDate > a.startDate ? 1 : -1,
      ),
    [termsQ.data],
  );
  const label = (t: Term) =>
    `${sessions.data?.find((s) => s.id === t.sessionId)?.name ?? ""} · ${t.name}`;
  const defaultId = (terms.find((t) => t.isCurrent) ?? terms[0])?.id ?? "";
  return {
    terms,
    label,
    defaultId,
    loading: sessions.loading || termsQ.loading,
    error: sessions.error || termsQ.error,
  };
}
