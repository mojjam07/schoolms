import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { fieldErrors, messageOf } from './forms';

export function useFetch<T>(path: string | null, opts: { auth?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api<T>(path, { auth: opts.auth ?? true })
      .then((d) => { if (!cancelled) { setData(d); setError(''); } })
      .catch((e) => { if (!cancelled) setError(messageOf(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

// Runs a save/delete action with a busy flag and an error message; returns true when it succeeded.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(''); setFields({});
    try { await fn(); return true; }
    catch (e) {
      setFields(fieldErrors(e)); setError(messageOf(e)); return false;
    } finally { setBusy(false); }
  }
  return { busy, error, fields, run, clear: () => { setError(''); setFields({}); } };
}

// For the public website: no sign-in, no token sent.
export const usePublic = <T,>(path: string | null) => useFetch<T>(path, { auth: false });
