import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, DataState, Empty, Field, PageHeader, Select, SmallButton, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import type { Session, Term } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

const TERM_LABELS = ['First Term', 'Second Term', 'Third Term'];

export default function Academic() {
  const sessions = useFetch<Session[]>('/academic/sessions');
  const [picked, setPicked] = useState('');
  const sid = picked || sessions.data?.find((s) => s.isCurrent)?.id || sessions.data?.[0]?.id || '';
  const terms = useFetch<Term[]>(sid ? `/academic/terms?sessionId=${sid}` : null);

  const addSession = useAction();
  const [sf, setSf] = useState({ name: '', startDate: '', endDate: '' });
  const rowAction = useAction();
  const addTerm = useAction();
  const [tf, setTf] = useState({ termNumber: '1', startDate: '', endDate: '' });

  async function submitSession(e: FormEvent) {
    e.preventDefault();
    if (await addSession.run(() => api('/academic/sessions', { body: sf }))) { setSf({ name: '', startDate: '', endDate: '' }); sessions.reload(); }
  }
  async function submitTerm(e: FormEvent) {
    e.preventDefault();
    if (await addTerm.run(() => api('/academic/terms', { body: { sessionId: sid, termNumber: Number(tf.termNumber), startDate: tf.startDate, endDate: tf.endDate } }))) {
      setTf({ termNumber: '1', startDate: '', endDate: '' }); terms.reload();
    }
  }
  async function makeCurrent(path: string) {
    if (await rowAction.run(() => api(path, { method: 'POST', body: {} }))) { sessions.reload(); terms.reload(); }
  }

  return (
    <>
      <PageHeader title="Sessions and terms" intro="Set up each school year and its three terms. The current session and term decide what students, teachers and parents see." />
      {rowAction.error && <div className="mb-4"><Alert tone="error">{rowAction.error}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Sessions">
          <DataState loading={sessions.loading} error={sessions.error}>
            {sessions.data?.length ? (
              <Table>
                <thead><tr><Th>Session</Th><Th>Runs</Th><Th /></tr></thead>
                <tbody>
                  {sessions.data.map((s) => (
                    <tr key={s.id}>
                      <Td>{s.name} {s.isCurrent && <Badge tone="good">Current</Badge>}</Td>
                      <Td>{s.startDate} to {s.endDate}</Td>
                      <Td>{!s.isCurrent && <SmallButton onClick={() => makeCurrent(`/academic/sessions/${s.id}/set-current`)}>Make current</SmallButton>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <Empty>No sessions yet. Add the first one below.</Empty>}
          </DataState>
          <form onSubmit={submitSession} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3" noValidate>
            <Field label="Session name" placeholder="2026/2027" value={sf.name} error={addSession.fields.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} />
            <Field label="Starts" type="date" value={sf.startDate} error={addSession.fields.startDate} onChange={(e) => setSf({ ...sf, startDate: e.target.value })} />
            <Field label="Ends" type="date" value={sf.endDate} error={addSession.fields.endDate} onChange={(e) => setSf({ ...sf, endDate: e.target.value })} />
            <div className="sm:col-span-3">
              {addSession.error && <div className="mb-3"><Alert tone="error">{addSession.error}</Alert></div>}
              <Button type="submit" loading={addSession.busy}>Add session</Button>
            </div>
          </form>
        </Card>

        <Card title="Terms">
          <Select label="Session" value={sid} onChange={(e) => setPicked(e.target.value)} disabled={!sessions.data?.length}>
            {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="mt-4">
            <DataState loading={terms.loading} error={terms.error}>
              {!sid ? <Empty>Add a session first.</Empty> : terms.data?.length ? (
                <Table>
                  <thead><tr><Th>Term</Th><Th>Runs</Th><Th /></tr></thead>
                  <tbody>
                    {terms.data.map((t) => (
                      <tr key={t.id}>
                        <Td>{t.name} {t.isCurrent && <Badge tone="good">Current</Badge>}</Td>
                        <Td>{t.startDate} to {t.endDate}</Td>
                        <Td>{!t.isCurrent && <SmallButton onClick={() => makeCurrent(`/academic/terms/${t.id}/set-current`)}>Make current</SmallButton>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : <Empty>No terms in this session yet.</Empty>}
            </DataState>
          </div>
          {sid && (
            <form onSubmit={submitTerm} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3" noValidate>
              <Select label="Term" value={tf.termNumber} onChange={(e) => setTf({ ...tf, termNumber: e.target.value })}>
                {TERM_LABELS.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </Select>
              <Field label="Starts" type="date" value={tf.startDate} error={addTerm.fields.startDate} onChange={(e) => setTf({ ...tf, startDate: e.target.value })} />
              <Field label="Ends" type="date" value={tf.endDate} error={addTerm.fields.endDate} onChange={(e) => setTf({ ...tf, endDate: e.target.value })} />
              <div className="sm:col-span-3">
                {addTerm.error && <div className="mb-3"><Alert tone="error">{addTerm.error}</Alert></div>}
                <Button type="submit" loading={addTerm.busy}>Add term</Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
