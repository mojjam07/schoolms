import { useEffect, useState } from 'react';
import { Alert, Button, Card, DataState, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useFetch } from '../../lib/useFetch';

interface Prefs { categories: { key: string; label: string; inApp: boolean; email: boolean }[]; alwaysOn: string }

// Same page for every role.
export default function NotificationPreferences() {
  const d = useFetch<Prefs>('/family/preferences'); const act = useAction();
  const [rows, setRows] = useState<Prefs['categories']>([]); const [saved, setSaved] = useState(false);
  useEffect(() => { if (d.data) setRows(d.data.categories); }, [d.data]);
  const flip = (key: string, f: 'inApp' | 'email') => { setSaved(false); setRows(rows.map((r) => (r.key === key ? { ...r, [f]: !r[f] } : r))); };
  const save = async () => { if (await act.run(() => api('/family/preferences', { method: 'PUT', body: { preferences: rows.map(({ key, inApp, email }) => ({ category: key, inApp, email })) } }))) setSaved(true); };
  return (
    <>
      <PageHeader title="Notification preferences" intro="Choose what you want to hear about, and how." />
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <Card>
            <div className="space-y-4">
              {act.error && <Alert tone="error">{act.error}</Alert>}{saved && <Alert tone="success">Saved.</Alert>}
              <table className="w-full text-sm">
                <caption className="sr-only">Notification choices</caption>
                <thead><tr><th scope="col" className="py-2 text-left">What</th><th scope="col" className="px-3 text-center">In the app</th><th scope="col" className="px-3 text-center">By email</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.key} className="border-t border-line"><th scope="row" className="py-2 pr-3 text-left font-normal">{r.label}</th>
                    <td className="text-center"><input type="checkbox" aria-label={`${r.label}, in the app`} checked={r.inApp} onChange={() => flip(r.key, 'inApp')} /></td>
                    <td className="text-center"><input type="checkbox" aria-label={`${r.label}, by email`} checked={r.email} onChange={() => flip(r.key, 'email')} /></td></tr>
                ))}</tbody>
              </table>
              <p className="text-xs text-muted">{d.data.alwaysOn}</p>
              <Button onClick={save} loading={act.busy}>Save preferences</Button>
            </div>
          </Card>
        )}
      </DataState>
    </>
  );
}
