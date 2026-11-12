import { Link } from "react-router-dom";
import ResultsHistoryView, {
  type HistoryData,
} from "../../components/ResultsHistoryView";
import { DataState, PageHeader } from "../../components/ui";
import { useFetch } from "../../lib/useFetch";

export default function StudentResultsHistory() {
  const d = useFetch<HistoryData>("/results-history/me");
  return (
    <>
      <PageHeader
        title="My progress"
        intro="How your results have changed from term to term."
      />
      <p className="mb-4 text-sm">
        <Link className="text-brand-700 underline" to="/student/results">
          Back to report cards
        </Link>
      </p>
      <DataState loading={d.loading} error={d.error}>
        {d.data && <ResultsHistoryView data={d.data} />}
      </DataState>
    </>
  );
}
