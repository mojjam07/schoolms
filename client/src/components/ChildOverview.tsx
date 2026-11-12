import { Link } from "react-router-dom";
import { Badge, Card, Empty } from "./ui";
import { fmtDate, fmtDateTime, naira } from "../lib/format";

export interface ChildData {
  className: string | null;
  sessionName: string | null;
  lessonsToday: {
    start: string;
    end: string;
    room: string | null;
    subject: string;
    teacher: string | null;
  }[];
  exams: {
    date: string;
    start: string;
    end: string;
    venue: string | null;
    subject: string;
    title: string;
  }[];
  assignments: {
    due: {
      id: string;
      title: string;
      subject: string;
      dueAt: string;
      handedIn: boolean;
    }[];
    overdueCount: number;
  };
  recentMarks: {
    id: string;
    title: string;
    marks: number;
    maxMarks: number;
    at: string | null;
  }[];
  attendance: {
    term: number;
    opened: number;
    present: number;
    late: number;
    absent: number;
    percent: number;
  } | null;
  latestResult: { termId: string; label: string } | null;
  fees: {
    invoiceId: string;
    number: string;
    totalKobo: number;
    paidKobo: number;
    outstandingKobo: number;
    dueDate: string | null;
  } | null;
}

// Shared by the student home (base "/student") and, once per child, the parent home (base "/parent").
export default function ChildOverview({
  d,
  base,
  studentId,
}: {
  d: ChildData;
  base: "/student" | "/parent";
  studentId?: string;
}) {
  const resultLink = d.latestResult
    ? base === "/student"
      ? `/student/results/${d.latestResult.termId}`
      : `/parent/results/${studentId}/${d.latestResult.termId}`
    : null;
  const assignLink = (id: string) =>
    base === "/student" ? `/student/assignments/${id}` : "/parent/assignments";
  if (!d.className)
    return (
      <Card>
        <Empty>No class has been set up for this session yet.</Empty>
      </Card>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {d.className} · {d.sessionName}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Today’s lessons">
          {d.lessonsToday.length === 0 ? (
            <Empty>No lessons today.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.lessonsToday.map((l, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <b>
                      {l.start}–{l.end}
                    </b>{" "}
                    {l.subject}
                    {l.room ? ` · ${l.room}` : ""}
                  </span>
                  {l.teacher && <span className="text-muted">{l.teacher}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm">
            <Link className="text-brand-700 underline" to={`${base}/timetable`}>
              Full timetable
            </Link>
          </p>
        </Card>
        <Card title="Upcoming examinations">
          {d.exams.length === 0 ? (
            <Empty>No examinations are scheduled.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.exams.map((e, i) => (
                <li key={i}>
                  <b>{e.subject}</b> · {fmtDate(e.date)}, {e.start}–{e.end}
                  {e.venue ? ` · ${e.venue}` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm">
            <Link className="text-brand-700 underline" to={`${base}/exams`}>
              All examinations
            </Link>
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Assignments due">
          {d.assignments.overdueCount > 0 && (
            <p className="mb-2 text-sm text-red-700">
              {d.assignments.overdueCount} past the deadline and not handed in.
            </p>
          )}
          {d.assignments.due.length === 0 ? (
            <Empty>Nothing is due soon.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.assignments.due.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <Link
                    className="text-brand-700 underline"
                    to={assignLink(a.id)}
                  >
                    {a.title}
                  </Link>
                  <span className="text-muted">
                    {a.subject} · due {fmtDateTime(a.dueAt)}
                  </span>
                  <Badge tone={a.handedIn ? "good" : "warn"}>
                    {a.handedIn ? "Handed in" : "Not handed in"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent marks">
          {d.recentMarks.length === 0 ? (
            <Empty>No marked work yet.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.recentMarks.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>{m.title}</span>
                  <b>
                    {m.marks} / {m.maxMarks}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Attendance this term">
          {d.attendance ? (
            <div className="space-y-1 text-sm">
              <p className="text-2xl font-semibold">{d.attendance.percent}%</p>
              <p className="text-muted">
                {d.attendance.present} present, {d.attendance.late} late,{" "}
                {d.attendance.absent} absent out of {d.attendance.opened} days
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No registers taken yet this term.
            </p>
          )}
          <p className="mt-2 text-sm">
            <Link
              className="text-brand-700 underline"
              to={`${base}/attendance`}
            >
              Attendance details
            </Link>
          </p>
        </Card>
        <Card title="Latest results">
          {d.latestResult && resultLink ? (
            <p className="text-sm">
              <Link className="text-brand-700 underline" to={resultLink}>
                {d.latestResult.label}
              </Link>{" "}
              report card is ready.
            </p>
          ) : (
            <p className="text-sm text-muted">
              No results have been published yet.
            </p>
          )}
        </Card>
        {d.fees && (
          <Card title="School fees this term">
            <div className="space-y-1 text-sm">
              <p>
                Outstanding <b>{naira(d.fees.outstandingKobo)}</b>
              </p>
              <p className="text-muted">
                Paid {naira(d.fees.paidKobo)} of {naira(d.fees.totalKobo)}
                {d.fees.dueDate ? ` · due ${fmtDate(d.fees.dueDate)}` : ""}
              </p>
              <Link
                className="text-brand-700 underline"
                to={`/parent/fees/${d.fees.invoiceId}`}
              >
                {d.fees.outstandingKobo > 0 ? "View and pay" : "View invoice"}
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
