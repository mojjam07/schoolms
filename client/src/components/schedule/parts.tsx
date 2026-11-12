import { Badge, Card, Empty } from "../ui";
import { fmtDate } from "../../lib/format";
import type { ExamPaper, Slot } from "../../lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// One card per weekday, so it reads well on a phone as well as a desktop.
export function TimetableView({
  entries,
  showClass = false,
  showTeachers = true,
}: {
  entries: Slot[];
  showClass?: boolean;
  showTeachers?: boolean;
}) {
  if (!entries.length)
    return <Empty>No lessons have been scheduled yet.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {DAYS.map((d, i) => {
        const day = entries.filter((e) => e.dayOfWeek === i + 1);
        return (
          <Card key={d} title={d}>
            {day.length ? (
              <ul className="divide-y divide-line">
                {day.map((e) => (
                  <li key={e.id} className="py-2">
                    <p className="font-medium">
                      {e.subjectName}
                      {showClass && (
                        <span className="font-normal text-muted">
                          {" "}
                          · {e.className}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {e.startTime} to {e.endTime}
                      {e.room ? ` · ${e.room}` : ""}
                      {showTeachers && e.teachers.length
                        ? ` · ${e.teachers.join(", ")}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No lessons</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function ExamList({
  papers,
  showClass = false,
  emptyText,
}: {
  papers: ExamPaper[];
  showClass?: boolean;
  emptyText: string;
}) {
  if (!papers.length) return <Empty>{emptyText}</Empty>;
  return (
    <ul className="divide-y divide-line">
      {papers.map((p) => (
        <li
          key={p.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3"
        >
          <div>
            <p className="font-medium">
              {p.subjectName}
              {showClass && (
                <span className="font-normal text-muted"> · {p.className}</span>
              )}
            </p>
            <p className="text-sm text-muted">{p.scheduleTitle}</p>
            {p.instructions && <p className="mt-1 text-sm">{p.instructions}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{fmtDate(p.date)}</p>
            <p className="text-muted">
              {p.startTime} to {p.endTime}
            </p>
            {p.venue && <Badge>{p.venue}</Badge>}
          </div>
        </li>
      ))}
    </ul>
  );
}
