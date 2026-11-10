import { useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, TextArea } from '../ui';
import { api } from '../../lib/api';
import { fmtDay, timeAgo } from '../../lib/format';
import type { ExplanationRow } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';
import { EXPLANATIONS_CHANGED } from './parts';

const FILTERS: [string, string][] = [['pending', 'Waiting for a reply'], ['accepted', 'Accepted'], ['declined', 'Not accepted'], ['', 'All']];

function Item({ e, onDone }: { e: ExplanationRow; onDone: () => void }) {
  const [note, setNote] = useState(''); const act = useAction();
  async function review(status: 'accepted' | 'declined') {
    if (await act.run(() => api(`/attendance/explanations/${e.id}`, { method: 'PATCH', body: { status, note: note.trim() || undefined } }))) { window.dispatchEvent(new Event(EXPLANATIONS_CHANGED)); onDone(); }
  }
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{e.studentName} <span className="font-normal text-muted">· {e.className}</span></p>
        <span className="flex items-center gap-2"><Badge tone={e.attendance === 'absent' ? 'bad' : 'warn'}>{e.attendance === 'absent' ? 'Absent' : 'Late'}</Badge>
          {e.status === 'pending' && <Badge tone="neutral">Waiting</Badge>}{e.status === 'accepted' && <Badge tone="good">Accepted</Badge>}{e.status === 'declined' && <Badge tone="bad">Not accepted</Badge>}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{fmtDay(e.date)} · sent by {e.submittedBy} {timeAgo(e.submittedAt).toLowerCase()}</p>
      <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-brand-50 p-3 text-sm">{e.reason}</p>
      {e.status === 'pending' ? (
        <div className="mt-4 space-y-3 lg:max-w-xl">
          <TextArea label="Reply to the parent (optional)" rows={2} maxLength={300} value={note} onChange={(ev) => setNote(ev.target.value)} hint="The parent sees this with your decision. A short reason helps, especially if you do not accept." />
          {act.error && <Alert tone="error">{act.error}</Alert>}
          <div className="flex flex-wrap gap-3">
            <div className="w-40"><Button onClick={() => review('accepted')} loading={act.busy}>Accept</Button></div>
            <button type="button" disabled={act.busy} onClick={() => review('declined')} className="rounded-lg border border-red-300 px-4 py-2.5 font-medium text-red-800 hover:bg-red-50 disabled:opacity-50">Do not accept</button>
          </div>
        </div>
      ) : e.reviewNote ? <p className="mt-3 text-sm text-muted">Your reply: {e.reviewNote}</p> : null}
    </li>
  );
}

// The form teacher sees explanations for their own classes; the administrator sees every class. The API enforces this.
export default function ExplanationQueue() {
  const [filter, setFilter] = useState('pending');
  const list = useFetch<ExplanationRow[]>(`/attendance/explanations${filter ? `?status=${filter}` : ''}`);
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Show explanations">
        {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${filter === k ? 'border-brand-500 bg-brand-500 text-white' : 'border-line hover:bg-brand-50'}`}>{l}</button>)}
      </div>
      <DataState loading={list.loading && !list.data} error={list.error}>
        {list.data?.length ? <ul className="space-y-4">{list.data.map((e) => <Item key={e.id} e={e} onDone={list.reload} />)}</ul>
          : <Card><Empty>{filter === 'pending' ? 'Nothing is waiting for a reply.' : 'No explanations to show.'}</Empty></Card>}
        {list.data && list.data.length >= 200 && <p className="mt-3 text-sm text-muted">Showing the 200 most recent.</p>}
      </DataState>
    </>
  );
}
