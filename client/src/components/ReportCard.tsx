import { Alert, Button } from "./ui";
import { fmtDateTime, num, ordinal } from "../lib/format";
import type { ReportCardData } from "../lib/types";

// The same card is used by the student, the parent and the administrator's preview, so everyone sees identical numbers.
export function ReportCard({ d }: { d: ReportCardData }) {
  const s = d.summary;
  return (
    <div className="max-w-4xl">
      {d.preview && (
        <div className="no-print mb-4">
          <Alert tone="error">
            Preview only. These results are not published, so students and
            parents cannot see them yet.
          </Alert>
        </div>
      )}
      <article className="rounded-xl border border-line bg-white p-5 sm:p-8">
        <header className="border-b-4 border-gold-400 pb-4 text-center">
          <p className="font-display text-2xl font-bold">{d.school.name}</p>
          <p className="text-sm text-muted">{d.school.address}</p>
          <p className="mt-3 text-lg font-semibold uppercase tracking-wide">
            Report card
          </p>
          <p className="text-sm">
            {d.sessionName} · {d.termName}
          </p>
        </header>
        <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Student</dt>
            <dd className="font-medium">{d.student.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Class</dt>
            <dd className="font-medium">{d.className}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Admission number</dt>
            <dd className="font-medium">{d.student.admissionNumber ?? "-"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Students in class</dt>
            <dd className="font-medium">{s.studentsInClass}</dd>
          </div>
        </dl>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-brand-50">
                <th className="border border-line px-2 py-2">Subject</th>
                {d.components.map((c) => (
                  <th
                    key={c.id}
                    className="border border-line px-2 py-2 text-center"
                  >
                    {c.name}
                    <div className="text-xs font-normal text-muted">
                      /{c.maxScore}
                    </div>
                  </th>
                ))}
                <th className="border border-line px-2 py-2 text-center">
                  Total
                  <div className="text-xs font-normal text-muted">
                    /{d.maxTotal}
                  </div>
                </th>
                <th className="border border-line px-2 py-2 text-center">%</th>
                <th className="border border-line px-2 py-2 text-center">
                  Grade
                </th>
                <th className="border border-line px-2 py-2">Remark</th>
                <th className="border border-line px-2 py-2 text-center">
                  Position
                </th>
                <th className="border border-line px-2 py-2 text-center">
                  Class avg
                </th>
              </tr>
            </thead>
            <tbody>
              {d.subjects.length ? (
                d.subjects.map((x) => (
                  <tr key={x.name}>
                    <td className="border border-line px-2 py-1.5 font-medium">
                      {x.name}
                    </td>
                    {d.components.map((c) => (
                      <td
                        key={c.id}
                        className="border border-line px-2 py-1.5 text-center"
                      >
                        {num(x.scores[c.id])}
                      </td>
                    ))}
                    <td className="border border-line px-2 py-1.5 text-center font-semibold">
                      {num(x.total)}
                    </td>
                    <td className="border border-line px-2 py-1.5 text-center">
                      {num(x.percent)}
                    </td>
                    <td className="border border-line px-2 py-1.5 text-center font-semibold">
                      {x.grade ?? "-"}
                    </td>
                    <td className="border border-line px-2 py-1.5">
                      {x.remark ?? ""}
                    </td>
                    <td className="border border-line px-2 py-1.5 text-center">
                      {ordinal(x.position)}
                    </td>
                    <td className="border border-line px-2 py-1.5 text-center">
                      {num(x.classAverage)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={d.components.length + 7}
                    className="border border-line px-2 py-4 text-center text-muted"
                  >
                    No scores have been entered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            [
              "Total marks",
              s.totalMarks === null
                ? "-"
                : `${num(s.totalMarks)} / ${s.totalPossible}`,
            ],
            ["Average", s.average === null ? "-" : `${num(s.average)}%`],
            ["Overall grade", s.grade ?? "-"],
            [
              "Position in class",
              s.position === null
                ? "-"
                : `${ordinal(s.position)} of ${s.outOf}`,
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-brand-50 p-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
              <p className="mt-1 text-lg font-bold">{v}</p>
            </div>
          ))}
        </div>
        <section className="mt-5" aria-label="Attendance">
          <p className="mb-1 text-sm font-semibold">Attendance</p>
          {d.attendance && d.attendance.opened > 0 ? (
            <div className="grid gap-3 sm:grid-cols-5">
              {[
                ["School days", d.attendance.opened],
                ["Present", d.attendance.present],
                ["Late", d.attendance.late],
                ["Absent", d.attendance.absent],
                [
                  "Attendance",
                  d.attendance.percentPresent === null
                    ? "-"
                    : `${d.attendance.percentPresent}%`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-brand-50 p-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {k}
                  </p>
                  <p className="mt-1 text-lg font-bold">{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No attendance was recorded for this term.
            </p>
          )}
          {d.attendance && d.attendance.opened > 0 && (
            <p className="mt-1 text-xs text-muted">
              Present includes late arrivals.
            </p>
          )}
        </section>
        {!s.ranked && (
          <p className="mt-3 rounded-lg bg-gold-100 p-3 text-sm">
            {s.missing.length
              ? `Some scores are not in yet (${s.missing.join(", ")}), so the totals, overall grade and class position cannot be worked out.`
              : "Overall figures appear once scores are entered."}
          </p>
        )}
        {d.remark && (
          <p className="mt-4 whitespace-pre-line rounded-lg border border-line p-3">
            <span className="font-semibold">Remarks: </span>
            {d.remark}
          </p>
        )}
        <section className="mt-5" aria-label="Grading scale">
          <p className="mb-1 text-sm font-semibold">Grading scale</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {d.gradingScale.map((b, i, arr) => (
              <span key={b.grade}>
                {b.grade}: {b.minPercent}
                {i === 0
                  ? "% and above"
                  : `-${num(arr[i - 1].minPercent - 0.01)}%`}
                {b.remark ? ` (${b.remark})` : ""}
              </span>
            ))}
          </p>
        </section>
        {d.publishedAt && (
          <p className="mt-4 text-xs text-muted">
            Published {fmtDateTime(d.publishedAt)}
          </p>
        )}
      </article>
      <div className="no-print mt-4 max-w-xs">
        <Button onClick={() => window.print()}>Print report card</Button>
      </div>
    </div>
  );
}
