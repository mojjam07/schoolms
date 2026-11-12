import { Badge, Card, Empty } from "./ui";

export interface HTerm {
  termId: string;
  termNumber: number;
  sessionName: string;
  className: string;
  average: number | null;
  grade: string | null;
  subjects: {
    subjectId: string;
    name: string;
    percent: number | null;
    grade: string | null;
    complete: boolean;
  }[];
  incompleteSubjects: string[];
}
export interface HYear {
  sessionId: string;
  sessionName: string;
  className: string;
  termsPublished: number;
  provisional: boolean;
  average: number | null;
  grade: string | null;
  subjects: {
    subjectId: string;
    name: string;
    percent: number;
    grade: string | null;
    termsCounted: number;
  }[];
}
export interface HistoryData {
  terms: HTerm[];
  years: HYear[];
}

// Average per published term as a simple line, with a text table underneath for screen readers.
function Trend({ terms }: { terms: HTerm[] }) {
  const pts = terms.filter((t) => t.average !== null);
  if (pts.length < 2) return null;
  const W = 560,
    H = 160,
    P = 28;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  const d = pts
    .map(
      (t, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.average!).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-xl"
      role="img"
      aria-label={`Average by term: ${pts.map((t) => `${t.sessionName} term ${t.termNumber} ${t.average}%`).join(", ")}`}
    >
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line
            x1={P}
            x2={W - P}
            y1={y(g)}
            y2={y(g)}
            stroke="currentColor"
            opacity="0.15"
          />
          <text
            x={4}
            y={y(g) + 4}
            fontSize="10"
            fill="currentColor"
            opacity="0.6"
          >
            {g}
          </text>
        </g>
      ))}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brand-700"
      />
      {pts.map((t, i) => (
        <g key={t.termId}>
          <circle
            cx={x(i)}
            cy={y(t.average!)}
            r="4"
            className="fill-brand-700"
          />
          <text
            x={x(i)}
            y={H - 6}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            T{t.termNumber}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ResultsHistoryView({ data }: { data: HistoryData }) {
  if (data.terms.length === 0)
    return (
      <Card>
        <Empty>
          No results have been published yet. They will appear here once the
          school publishes them.
        </Empty>
      </Card>
    );
  const termKeys = data.terms.map((t) => ({
    id: t.termId,
    label: `${t.sessionName.split("/")[0]} T${t.termNumber}`,
  }));
  const subjectNames = [
    ...new Set(data.terms.flatMap((t) => t.subjects.map((s) => s.name))),
  ].sort();
  const cell = (t: HTerm, name: string) =>
    t.subjects.find((s) => s.name === name);
  return (
    <div className="space-y-6">
      <Card title="Average by term">
        <Trend terms={data.terms} />
      </Card>

      <Card title="Subjects across terms">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Percentage and grade for each subject in each published term
            </caption>
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-4 text-left">
                  Subject
                </th>
                {termKeys.map((k) => (
                  <th key={k.id} scope="col" className="px-2 py-2 text-right">
                    {k.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectNames.map((n) => (
                <tr key={n} className="border-t border-line">
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    {n}
                  </th>
                  {data.terms.map((t) => {
                    const c = cell(t, n);
                    return (
                      <td key={t.termId} className="px-2 py-2 text-right">
                        {c && c.percent !== null ? (
                          <>
                            {c.percent}%{" "}
                            <span className="text-muted">{c.grade}</span>
                          </>
                        ) : (
                          <span className="text-muted">
                            {c ? "incomplete" : "·"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <th scope="row" className="py-2 pr-4 text-left">
                  Average
                </th>
                {data.terms.map((t) => (
                  <td key={t.termId} className="px-2 py-2 text-right">
                    {t.average !== null ? (
                      <>
                        {t.average}% {t.grade}
                      </>
                    ) : (
                      "·"
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          A subject shows “incomplete” when a score is still missing for that
          term, and is left out of the average.
        </p>
      </Card>

      {data.years.map((y) => (
        <Card
          key={y.sessionId}
          title={`Yearly result ${y.sessionName} (${y.className})`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold">
              {y.average !== null ? `${y.average}%` : "·"}
            </span>
            {y.grade && <Badge tone="good">{y.grade}</Badge>}
            {y.provisional && (
              <Badge tone="warn">
                Provisional: {y.termsPublished} of 3 terms published
              </Badge>
            )}
          </div>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {y.subjects.map((s) => (
              <li
                key={s.subjectId}
                className="flex justify-between border-b border-line py-1"
              >
                <span>{s.name}</span>
                <span>
                  {s.percent}%{" "}
                  <span className="text-muted">
                    {s.grade}
                    {s.termsCounted < y.termsPublished
                      ? ` · ${s.termsCounted} term${s.termsCounted === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Each subject is the average of its percentages over the published
            terms where all scores were entered.
          </p>
        </Card>
      ))}
    </div>
  );
}
