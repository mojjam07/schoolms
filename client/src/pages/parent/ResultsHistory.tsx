import { useState } from 'react';
import { Link } from 'react-router-dom';
import ResultsHistoryView, { type HistoryData } from '../../components/ResultsHistoryView';
import { DataState, Empty, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/useFetch';

export default function ParentResultsHistory() {
  const d = useFetch<(HistoryData & { studentId: string; name: string })[]>('/results-history/children');
  const [pick, setPick] = useState<string | null>(null);
  const child = d.data?.find((c) => c.studentId === pick) ?? d.data?.[0];
  return (
    <>
      <PageHeader title="Progress over time" intro="How your children’s results have changed from term to term." />
      <p className="mb-4 text-sm"><Link className="text-brand-700 underline" to="/parent/results">Back to report cards</Link></p>
      <DataState loading={d.loading} error={d.error}>
        {d.data && d.data.length === 0 ? <Empty>No children are linked to your account yet.</Empty> : child && (
          <>
            {d.data!.length > 1 && (
              <div role="tablist" aria-label="Choose a child" className="mb-4 flex flex-wrap gap-2">
                {d.data!.map((c) => <button key={c.studentId} role="tab" aria-selected={c.studentId === child.studentId} onClick={() => setPick(c.studentId)}
                  className={`rounded-full border px-4 py-1.5 text-sm ${c.studentId === child.studentId ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white'}`}>{c.name}</button>)}
              </div>
            )}
            <h2 className="mb-2 text-lg font-semibold">{child.name}</h2>
            <ResultsHistoryView data={child} />
          </>
        )}
      </DataState>
    </>
  );
}
