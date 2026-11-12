import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, TextArea } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useAction, useFetch } from '../../lib/useFetch';

interface Req { id: string; kind: 'relationship' | 'remove' | 'add'; status: string; studentName: string | null; proposedRelationship: string | null; childName: string | null; note: string; decisionNote: string | null; createdAt: string }
interface Family {
  contact: { firstName: string; lastName: string; email: string; phone: string | null; address: string | null };
  children: { studentId: string; name: string; relationship: string; isPrimary: boolean; className: string | null }[]; requests: Req[];
}
const REL = ['mother', 'father', 'guardian', 'other'];
const KIND = { relationship: 'Correct a relationship', remove: 'Remove a child', add: 'Add a child' } as const;
const tone = (s: string) => (s === 'approved' ? 'good' : s === 'pending' ? 'warn' : undefined);

export default function ParentAccount() {
  const d = useFetch<Family>('/family/me');
  const save = useAction(); const send = useAction(); const other = useAction();
  const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [saved, setSaved] = useState(false);
  const [kind, setKind] = useState<'relationship' | 'remove' | 'add'>('relationship');
  const [studentId, setStudentId] = useState(''); const [rel, setRel] = useState('mother'); const [childName, setChildName] = useState(''); const [adm, setAdm] = useState(''); const [note, setNote] = useState('');
  useEffect(() => { if (d.data) { setPhone(d.data.contact.phone ?? ''); setAddress(d.data.contact.address ?? ''); } }, [d.data]);

  const saveContact = async () => { setSaved(false); if (await save.run(() => api('/family/me/contact', { method: 'PATCH', body: { phone, address } }))) { setSaved(true); d.reload(); } };
  const submit = async () => {
    const body = kind === 'add' ? { kind, childName: childName || undefined, admissionNumber: adm || undefined, proposedRelationship: rel, note }
      : { kind, studentId, proposedRelationship: kind === 'relationship' ? rel : undefined, note };
    if (await send.run(() => api('/family/me/requests', { body }))) { setNote(''); setChildName(''); setAdm(''); d.reload(); }
  };
  const cancel = async (id: string) => { if (await other.run(() => api(`/family/me/requests/${id}/cancel`, { body: {} }))) d.reload(); };

  return (
    <>
      <PageHeader title="My account" intro="Your contact details, the children linked to you, and requests to correct them." />
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <div className="space-y-6">
            <Card title="Contact details">
              <div className="space-y-3">
                {save.error && <Alert tone="error">{save.error}</Alert>}{saved && <Alert tone="success">Saved.</Alert>}
                <p className="text-sm text-muted">{d.data.contact.firstName} {d.data.contact.lastName} · {d.data.contact.email}. To change your name or email address, please contact the school office.</p>
                <Field label="Phone number" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
                <TextArea label="Home address" rows={3} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
                <Button onClick={saveContact} loading={save.busy}>Save details</Button>
              </div>
            </Card>

            <Card title="Children linked to you">
              {d.data.children.length === 0 ? <Empty>No children are linked yet.</Empty> : (
                <ul className="space-y-1 text-sm">{d.data.children.map((c) => <li key={c.studentId}><b>{c.name}</b> · {c.relationship}{c.isPrimary ? ' (primary contact)' : ''}{c.className ? ` · ${c.className}` : ''}</li>)}</ul>
              )}
              <p className="mt-2 text-xs text-muted">Only the school can change these links. If something is wrong, send a request below and the school will check it before changing anything.</p>
            </Card>

            <Card title="Ask the school to correct a link">
              <div className="space-y-3">
                {send.error && <Alert tone="error">{send.error}</Alert>}
                <Select label="What do you need?" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</Select>
                {kind !== 'add' ? (
                  <Select label="Which child?" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose…</option>{d.data.children.map((c) => <option key={c.studentId} value={c.studentId}>{c.name}</option>)}</Select>
                ) : (
                  <><Field label="Child’s full name" value={childName} maxLength={120} onChange={(e) => setChildName(e.target.value)} /><Field label="Admission number (if you know it)" value={adm} maxLength={40} onChange={(e) => setAdm(e.target.value)} /></>
                )}
                {kind !== 'remove' && <Select label={kind === 'add' ? 'Your relationship to the child' : 'The correct relationship'} value={rel} onChange={(e) => setRel(e.target.value)}>{REL.map((r) => <option key={r} value={r}>{r}</option>)}</Select>}
                <TextArea label="What should change, and why?" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button onClick={submit} loading={send.busy} disabled={!note.trim() || (kind !== 'add' && !studentId) || (kind === 'add' && !childName.trim() && !adm.trim())}>Send request</Button>
              </div>
            </Card>

            <Card title="Your requests">
              {other.error && <Alert tone="error">{other.error}</Alert>}
              {d.data.requests.length === 0 ? <Empty>You have not sent any requests.</Empty> : (
                <ul className="space-y-3 text-sm">{d.data.requests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><b>{KIND[r.kind]}{r.studentName ? `: ${r.studentName}` : r.childName ? `: ${r.childName}` : ''}</b><Badge tone={tone(r.status)}>{r.status}</Badge></div>
                    <p className="mt-1 text-muted">{fmtDate(r.createdAt)} · {r.note}</p>
                    {r.decisionNote && <p className="mt-1">School’s reply: {r.decisionNote}</p>}
                    {r.status === 'pending' && <div className="mt-2"><SmallButton onClick={() => cancel(r.id)}>Cancel request</SmallButton></div>}
                  </li>
                ))}</ul>
              )}
            </Card>
            <p className="text-sm"><Link className="text-brand-700 underline" to="/parent/preferences">Choose which notifications you receive</Link></p>
          </div>
        )}
      </DataState>
    </>
  );
}
