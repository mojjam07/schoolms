import { useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

interface Item { id: string; kind: 'relationship' | 'remove' | 'add'; status: string; parentName: string; parentEmail: string; studentName: string | null; currentRelationship: string | null; proposedRelationship: string | null; childName: string | null; admissionNumber: string | null; note: string; decisionNote: string | null; createdAt: string }
const WHAT = { relationship: 'Change relationship', remove: 'Remove link', add: 'Add a child' } as const;

export default function FamilyRequests() {
  const [status, setStatus] = useState('pending'); const [page, setPage] = useState(1);
  const list = useFetch<Paged<Item>>(`/family/admin/requests?page=${page}${status ? `&status=${status}` : ''}`);
  const act = useAction(); const [notes, setNotes] = useState<Record<string, string>>({}); const [studentIds, setStudentIds] = useState<Record<string, string>>({});
  const decide = async (r: Item, decision: 'approve' | 'decline') => {
    if (await act.run(() => api(`/family/admin/requests/${r.id}/decide`, { body: { decision, note: notes[r.id] || undefined, studentId: studentIds[r.id] || undefined } }))) list.reload();
  };
  return (
    <>
      <PageHeader title="Guardian requests" intro="Parents ask for their links to children to be corrected. Check who is asking before you approve: approving changes who can see the child’s results and fees." />
      <div className="mb-4 max-w-xs"><Select label="Show" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="pending">Waiting</option><option value="">All</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></Select></div>
      {act.error && <div className="mb-3"><Alert tone="error">{act.error}</Alert></div>}
      <DataState loading={list.loading} error={list.error}>
        {list.data && list.data.items.length === 0 ? <Empty>No requests.</Empty> : (
          <ul className="space-y-3">{list.data?.items.map((r) => (
            <li key={r.id}><Card>
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{WHAT[r.kind]}</b><Badge tone={r.status === 'approved' ? 'good' : r.status === 'pending' ? 'warn' : undefined}>{r.status}</Badge></div>
              <p className="mt-1 text-sm">{r.parentName} ({r.parentEmail}) · {fmtDate(r.createdAt)}</p>
              <p className="text-sm">{r.kind === 'add' ? <>Child named: <b>{r.childName || 'not given'}</b>{r.admissionNumber ? `, admission number ${r.admissionNumber}` : ''} · as {r.proposedRelationship ?? 'guardian'}</>
                : <>Child: <b>{r.studentName}</b>{r.kind === 'relationship' && <> · now “{r.currentRelationship}”, asked to be “{r.proposedRelationship}”</>}</>}</p>
              <p className="mt-1 text-sm text-muted">“{r.note}”</p>
              {r.decisionNote && <p className="mt-1 text-sm">Reply: {r.decisionNote}</p>}
              {r.status === 'pending' && (
                <div className="mt-3 space-y-2">
                  {r.kind === 'add' && <Field label="Student ID to link (leave empty to match by admission number)" value={studentIds[r.id] ?? ''} onChange={(e) => setStudentIds({ ...studentIds, [r.id]: e.target.value })} />}
                  <Field label="Note to the parent (optional)" maxLength={500} value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <div className="flex gap-2"><Button onClick={() => decide(r, 'approve')} loading={act.busy}>Approve and apply</Button><Button onClick={() => decide(r, 'decline')} loading={act.busy}>Decline</Button></div>
                </div>
              )}
            </Card></li>
          ))}</ul>
        )}
      </DataState>
    </>
  );
}
