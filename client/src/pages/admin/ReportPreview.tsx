import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, DataState, Field } from '../../components/ui';
import { ReportCard } from '../../components/ReportCard';
import { api } from '../../lib/api';
import type { ReportCardData } from '../../lib/types';
import { useAction, useFetch } from '../../lib/useFetch';

export default function ReportPreview() {
  const { termId = '', studentId = '' } = useParams();
  const card = useFetch<ReportCardData>(`/results/report-card?termId=${termId}&studentId=${studentId}`);
  const [remark, setRemark] = useState(''); const act = useAction(); const [msg, setMsg] = useState('');
  useEffect(() => { if (card.data) setRemark(card.data.remark ?? ''); }, [card.data]);
  async function save() { setMsg(''); if (await act.run(() => api('/results/remarks', { method: 'PUT', body: { termId, studentId, remark } }))) { setMsg('Remark saved.'); card.reload(); } }
  return (
    <>
      <p className="no-print mb-3 text-sm"><Link className="font-medium text-brand-700 underline" to="/admin/results">All results</Link></p>
      <DataState loading={card.loading && !card.data} error={card.error}>
        {card.data && (
          <div className="space-y-6">
            <div className="no-print max-w-4xl"><Card title="Remark for this report card">
              <Field label="Remark (optional)" value={remark} onChange={(e) => setRemark(e.target.value)} hint="Shown on the report card, for example a comment from the principal or form teacher." />
              {act.error && <div className="mt-3"><Alert tone="error">{act.error}</Alert></div>}{msg && <div className="mt-3"><Alert tone="success">{msg}</Alert></div>}
              <div className="mt-3 max-w-xs"><Button onClick={save} loading={act.busy}>Save remark</Button></div>
            </Card></div>
            <ReportCard d={card.data} />
          </div>
        )}
      </DataState>
    </>
  );
}
