import { useState } from 'react';
import { Alert, Badge, Card, DataState, Empty, PageHeader, Select, SmallButton } from '../../../components/ui';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import type { Paged } from '../../../lib/types';
import { useAction, useFetch } from '../../../lib/useFetch';

interface Msg { id: string; name: string; email: string; phone: string | null; subject: string; message: string; status: 'new' | 'read' | 'archived'; receivedAt: string }

export default function Messages() {
  const [status, setStatus] = useState('new');
  const list = useFetch<Paged<Msg>>(`/admin/site/messages?pageSize=100${status ? `&status=${status}` : ''}`);
  const act = useAction();
  const set = async (m: Msg, s: string) => { if (await act.run(() => api(`/admin/site/messages/${m.id}`, { method: 'PATCH', body: { status: s } }))) list.reload(); };
  return (
    <>
      <PageHeader title="Messages" intro="Messages sent through the website's contact form." />
      <div className="mb-4 max-w-xs"><Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="new">New</option><option value="read">Read</option><option value="archived">Archived</option><option value="">All</option></Select></div>
      {act.error && <div className="mb-4"><Alert tone="error">{act.error}</Alert></div>}
      <DataState loading={list.loading && !list.data} error={list.error}>
        {list.data?.items.length ? (
          <ul className="space-y-4">{list.data.items.map((m) => (
            <li key={m.id}><Card>
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{m.subject}</p><p className="text-sm text-muted">{m.name} · {m.email}{m.phone ? ` · ${m.phone}` : ''} · {fmtDateTime(m.receivedAt)}</p></div><Badge tone={m.status === 'new' ? 'warn' : 'neutral'}>{m.status === 'new' ? 'New' : m.status === 'read' ? 'Read' : 'Archived'}</Badge></div>
              <p className="mt-3 whitespace-pre-line break-words">{m.message}</p>
              <div className="mt-4 flex flex-wrap gap-2"><a className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-brand-50" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>Reply by email</a>
                {m.status !== 'read' && <SmallButton onClick={() => set(m, 'read')} disabled={act.busy}>Mark as read</SmallButton>}{m.status !== 'archived' && <SmallButton onClick={() => set(m, 'archived')} disabled={act.busy}>Archive</SmallButton>}{m.status !== 'new' && <SmallButton onClick={() => set(m, 'new')} disabled={act.busy}>Mark as new</SmallButton>}</div>
            </Card></li>))}</ul>
        ) : <Card><Empty>No messages here.</Empty></Card>}
      </DataState>
    </>
  );
}
