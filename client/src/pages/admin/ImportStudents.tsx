import { useState, type ChangeEvent } from 'react';
import { Alert, Badge, Button, Card, PageHeader, SmallButton, Table, Td, TextArea, Th } from '../../components/ui';
import { api, downloadFromApi } from '../../lib/api';
import type { ImportResult } from '../../lib/types';
import { useAction } from '../../lib/useFetch';

export default function ImportStudents() {
  const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const check = useAction(); const run = useAction(); const dl = useAction();

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name); setResult(null); setCsv(await f.text());
  }
  const post = (dryRun: boolean) => async () => { setResult(await api<ImportResult>('/students/import', { body: { csv, dryRun } })); };

  return (
    <>
      <PageHeader title="Import students" intro="Create many student accounts from a spreadsheet saved as CSV. Nothing is created until the file passes the check, and then every student is created together or none are." />
      <div className="space-y-6">
        <Card title="1. Get your file ready">
          <p className="mb-3 text-sm">Columns: <b>firstName, lastName, email, admissionNumber</b> are required; <b>phone, dateOfBirth</b> (YYYY-MM-DD) and <b>class</b> (for example JSS 1A, placed in the current session) are optional. Up to 500 students per file. Each student needs their own email address.</p>
          <SmallButton onClick={() => dl.run(() => downloadFromApi('/students/import/template', 'students-template.csv'))}>Download a template</SmallButton>
          {dl.error && <div className="mt-3"><Alert tone="error">{dl.error}</Alert></div>}
        </Card>
        <Card title="2. Choose the file">
          <input type="file" accept=".csv,text/csv" onChange={pick} className="block text-sm" />
          {fileName && <p className="mt-2 text-sm text-muted">{fileName}</p>}
          <div className="mt-4"><TextArea label="Or paste the CSV here" rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} /></div>
          <div className="mt-4 max-w-xs"><Button loading={check.busy} disabled={!csv.trim()} onClick={() => check.run(post(true))}>Check the file</Button></div>
          {check.error && <div className="mt-3"><Alert tone="error">{check.error}</Alert></div>}
        </Card>

        {result && !result.dryRun && (
          <Alert tone="success">{result.imported} student{result.imported === 1 ? '' : 's'} created. Activation emails accepted by the email service: {result.emailsAccepted} of {result.imported}. For any that were not, use Resend email on the Accounts page.</Alert>
        )}
        {result?.dryRun && (
          <Card title="3. Result of the check">
            <p className="mb-3">{result.validRows} of {result.totalRows} lines are fine{result.errorRows ? <>, <Badge tone="bad">{result.errorRows} need fixing</Badge></> : ''}.</p>
            {!!result.errors.length && (
              <Table>
                <thead><tr><Th>Line</Th><Th>Field</Th><Th>Problem</Th></tr></thead>
                <tbody>{result.errors.map((e, i) => <tr key={i}><Td>{e.row}</Td><Td>{e.field}</Td><Td>{e.message}</Td></tr>)}</tbody>
              </Table>
            )}
            {result.moreErrors > 0 && <p className="mt-2 text-sm text-muted">And {result.moreErrors} more problems. Fix these and check again.</p>}
            {result.canImport ? (
              <div className="mt-4 max-w-xs"><Button loading={run.busy} onClick={() => { if (window.confirm(`Create ${result.totalRows} student accounts and email each an activation link?`)) run.run(post(false)); }}>Create {result.totalRows} students</Button></div>
            ) : <p className="mt-3 text-sm text-muted">Fix the lines above in your spreadsheet, save it again and re-check. Line 1 is the header row.</p>}
            {run.error && <div className="mt-3"><Alert tone="error">{run.error}</Alert></div>}
          </Card>
        )}
      </div>
    </>
  );
}
