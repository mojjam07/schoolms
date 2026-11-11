export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export interface User { id: string; email: string; role: Role; status: string; firstName: string; lastName: string }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
let accessToken: string | null = null;
let refreshing: Promise<User | null> | null = null;
let onSessionLost: () => void = () => {};

export const setSessionLostHandler = (fn: () => void) => { onSessionLost = fn; };
// A small "was signed in" hint, so a signed-out visitor does not call /auth/refresh at all (that call can only fail with a 401,
// and the browser prints every failed request in red). It holds no token: the real session is still the secure cookie.
const HINT = 'kok_session';
const hint = {
  get: () => { try { return localStorage.getItem(HINT) === '1'; } catch { return true; } },
  set: () => { try { localStorage.setItem(HINT, '1'); } catch { /* private mode: ignore */ } },
  clear: () => { try { localStorage.removeItem(HINT); } catch { /* ignore */ } },
};

export const setAccessToken = (t: string | null) => { accessToken = t; if (t) hint.set(); else hint.clear(); };

async function send(path: string, method: string, body?: unknown, withAuth = true) {
  const isForm = body instanceof FormData; // the browser sets the multipart boundary itself
  return fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(withAuth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
}

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Something went wrong. Please try again.', e?.details);
  }
  return json.data as T;
}

// Shared so that React StrictMode's double effect (or two components) makes only one refresh call.
export function refreshSession(): Promise<User | null> {
  refreshing ??= (async () => {
    try {
      if (!hint.get()) { accessToken = null; return null; } // signed out: nothing to refresh, so no request
      const res = await send('/auth/refresh', 'POST', undefined, false);
      if (!res.ok) { accessToken = null; hint.clear(); return null; }
      const data = await parse<{ user: User; accessToken: string }>(res);
      accessToken = data.accessToken; hint.set();
      return data.user;
    } catch {
      accessToken = null;
      return null;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = opts.body !== undefined ? 'POST' : 'GET', body, auth = true } = opts;
  let res: Response;
  try {
    res = await send(path, method, body, auth);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection and try again.');
  }
  if (res.status === 401 && auth) {
    const user = await refreshSession();
    if (!user) { onSessionLost(); throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue'); }
    res = await send(path, method, body, auth);
  }
  return parse<T>(res);
}

export const uploadFile = (file: File, purpose?: 'resource' | 'assignment' | 'submission' | 'public') => {
  const form = new FormData();
  form.append('file', file);
  return api<{ id: string; name: string; mimeType: string; sizeBytes: number }>(`/files${purpose ? `?purpose=${purpose}` : ''}`, { body: form });
};

// Files sit behind permission checks, so a plain <a href> cannot send the sign-in token. Fetch, then save the blob.
export async function downloadFile(id: string, filename: string) {
  let res = await send(`/files/${id}/download`, 'GET');
  if (res.status === 401) {
    const user = await refreshSession();
    if (!user) { onSessionLost(); throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue'); }
    res = await send(`/files/${id}/download`, 'GET');
  }
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'This file is not available.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Where public pictures live. In development the API is proxied (empty base); in production it is the API's address.
export const mediaSrc = (url: string | null | undefined) => (url ? `${BASE}${url}` : '');

// For admin previews of pictures that are not public yet: fetched with the sign-in token, then shown from memory.
export async function fetchFileBlob(id: string): Promise<Blob> {
  let res = await send(`/files/${id}/download`, 'GET');
  if (res.status === 401) {
    const user = await refreshSession();
    if (!user) { onSessionLost(); throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue'); }
    res = await send(`/files/${id}/download`, 'GET');
  }
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'This picture is not available.');
  return res.blob();
}

// Same idea for reports: fetched with the sign-in token, then saved from memory.
export async function downloadFromApi(path: string, filename: string) {
  let res = await send(path, 'GET');
  if (res.status === 401) {
    const user = await refreshSession();
    if (!user) { onSessionLost(); throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue'); }
    res = await send(path, 'GET');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiError(res.status, 'DOWNLOAD_FAILED', j?.error?.message ?? 'The download failed. Please try again.');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
