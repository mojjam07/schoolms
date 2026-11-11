import { useState } from 'react';
import { Alert, Badge, Button, Card, DataState, Field, PageHeader, Table, Td, Th } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useFetch } from '../../lib/useFetch';

interface Preview { rules: { key: string; label: string; rule: string; enabled: boolean; count: number }[]; files: { rule: string; count: number; connected: boolean } }
interface RunResult { removed: Record<string, number>; files: { connected: boolean; removed: number; failed: number } }

export default function DataPrivacy() {
  const prev = useFetch<Preview>('/admin/data/retention');
  const run = useAction(); const exp = useAction();
  const [result, setResult] = useState<RunResult | null>(null);
  const [email, setEmail] = useState(''); const [exported, setExported] = useState('');

  const cleanup = async () => {
    if (!window.confirm('Permanently remove everything listed as due? This cannot be undone.')) return;
    let out: RunResult | null = null;
    if (await run.run(async () => { out = await api<RunResult>('/admin/data/retention/run', { method: 'POST', body: {} }); })) { setResult(out); prev.reload(); }
  };
  const download = async () => {
    let data: unknown = null;
    if (!(await exp.run(async () => { data = await api(`/admin/data/export?email=${encodeURIComponent(email.trim())}`); }))) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `data-export-${email.trim().replace(/[^a-z0-9]+/gi, '-')}.json`; a.click(); URL.revokeObjectURL(url);
    setExported(email.trim());
  };

  return (
    <>
      <PageHeader title="Data and privacy" intro="Remove old records the school no longer needs, and export everything held about one person when they ask for it." />

      <h2 className="mb-2 text-lg font-semibold">Clean-up of old records</h2>
      <p className="mb-3 text-sm text-muted">The audit log, results, fees, attendance and anyone who became a student are never removed here. How long each kind of record is kept is set by the school’s settings on the server.</p>
      <DataState loading={prev.loading} error={prev.error}>
        {prev.data && (
          <Card>
            <Table>
              <thead><tr><Th>Record</Th><Th>Rule</Th><Th>Due now</Th></tr></thead>
              <tbody>
                {prev.data.rules.map((r) => (
                  <tr key={r.key}><Td>{r.label}</Td><Td>{r.rule}</Td><Td>{r.enabled ? r.count : <Badge tone="warn">Off</Badge>}</Td></tr>
                ))}
                <tr><Td>Unattached uploaded files</Td><Td>{prev.data.files.rule}{!prev.data.files.connected && ' (file removal is not connected yet, so files are never deleted)'}</Td><Td>{prev.data.files.count}</Td></tr>
              </tbody>
            </Table>
            <div className="mt-4 space-y-3">
              {run.error && <Alert tone="error">{run.error}</Alert>}
              {result && <Alert tone="success">Done. Removed: {Object.entries(result.removed).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(', ')}{result.files.connected ? `, files ${result.files.removed}${result.files.failed ? ` (${result.files.failed} could not be removed and will be retried)` : ''}` : ''}.</Alert>}
              <Button onClick={cleanup} loading={run.busy}>Remove everything due now</Button>
            </div>
          </Card>
        )}
      </DataState>

      <h2 className="mb-2 mt-10 text-lg font-semibold">Export one person’s data</h2>
      <p className="mb-3 text-sm text-muted">For a data-access request. Check who is asking before you send the file. The export leaves out passwords and other people’s messages, and it is recorded in the audit log.</p>
      <Card>
        <div className="space-y-3">
          {exp.error && <Alert tone="error">{exp.error}</Alert>}
          {exported && <Alert tone="success">Downloaded the export for {exported}.</Alert>}
          <Field label="Account email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={download} loading={exp.busy} disabled={!email.trim()}>Download export</Button>
        </div>
      </Card>
    </>
  );
}
