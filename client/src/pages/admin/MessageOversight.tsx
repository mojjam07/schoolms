import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DataState, Empty, Field, PageHeader, Select } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { MessageThreadSummary, Paged } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

// Every conversation between parents and staff, for safeguarding. Opening one is recorded in the audit log.
export default function MessageOversight() {
  const [q, setQ] = useState(''); const [reported, setReported] = useState(''); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q.trim() && { q: q.trim() }), ...(reported && { reported }) });
  const list = useFetch<Paged<MessageThreadSummary>>(`/messages/admin/threads?${qs}`);
  return (
    <>
      <PageHeader title="All conversations" intro="Review parent and staff conversations. Opening a conversation is recorded in the audit log." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Search" placeholder="Subject, parent, teacher or pupil" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select label="Show" value={reported} onChange={(e) => { setReported(e.target.value); setPage(1); }}><option value="">Everything</option><option value="true">Reported only</option></Select>
      </div>
      <DataState loading={list.loading} error={list.error}>
        {list.data && list.data.items.length === 0 ? <Empty>No conversations found.</Empty> : (
          <ul className="space-y-2">{list.data?.items.map((t) => (
            <li key={t.id}><Link to={`/admin/messages/${t.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-brand-700">
              <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{t.subject}</p>{t.reported && <Badge tone="warn">Reported</Badge>}</div>
              <p className="text-sm text-muted">{t.parentName} ↔ {t.staffName} · about {t.studentName} · {fmtDateTime(t.lastMessageAt)}</p></Link></li>
          ))}</ul>
        )}
        {list.data && list.data.total > list.data.pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-line px-3 py-1 disabled:opacity-40">Previous</button>
            <span>Page {page} of {Math.ceil(list.data.total / list.data.pageSize)}</span>
            <button disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)} className="rounded border border-line px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        )}
      </DataState>
    </>
  );
}
