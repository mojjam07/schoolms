import { Link } from "react-router-dom";
import { Badge, Card, DataState, Empty, PageHeader } from "../../components/ui";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { useFetch } from "../../lib/useFetch";

interface Item {
  id: string;
  title: string;
  className: string;
  subject: string;
  dueAt: string;
  waiting: number;
  handedIn: number;
  pupils: number;
}
interface Overview {
  classes: number;
  teaching: { classId: string; className: string; subject: string }[];
  toMark: Item[];
  upcoming: Item[];
  waitingTotal: number;
  announcements: {
    id: string;
    title: string;
    pinned: boolean;
    publishedAt: string | null;
  }[];
  unreadMessages: number | null;
}

export default function TeacherDashboard() {
  const d = useFetch<Overview>("/dashboard/teacher");
  return (
    <>
      <PageHeader
        title="Home"
        intro="Your classes and what needs your attention."
      />
      <DataState loading={d.loading} error={d.error}>
        {d.data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card title="Classes you teach">
                <p className="text-2xl font-semibold">{d.data.classes}</p>
              </Card>
              <Card title="Work waiting to be marked">
                <p className="text-2xl font-semibold">{d.data.waitingTotal}</p>
              </Card>
              {d.data.unreadMessages !== null && (
                <Card title="Unread messages">
                  <p className="text-2xl font-semibold">
                    <Link className="text-brand-700" to="/teacher/messages">
                      {d.data.unreadMessages}
                    </Link>
                  </p>
                </Card>
              )}
            </div>

            <Card title="Waiting to be marked">
              {d.data.toMark.length === 0 ? (
                <Empty>Nothing is waiting. Well done.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.data.toMark.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        className="text-brand-700 underline"
                        to={`/teacher/assignments/${a.id}`}
                      >
                        {a.title}
                      </Link>
                      <span className="text-muted">
                        {a.className} · {a.subject}
                      </span>
                      <Badge tone="warn">{a.waiting} to mark</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Upcoming deadlines">
              {d.data.upcoming.length === 0 ? (
                <Empty>No assignments are due soon.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.data.upcoming.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        className="text-brand-700 underline"
                        to={`/teacher/assignments/${a.id}`}
                      >
                        {a.title}
                      </Link>
                      <span className="text-muted">
                        {a.className} · due {fmtDateTime(a.dueAt)}
                      </span>
                      <span>
                        {a.handedIn} of {a.pupils} handed in
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Your classes and subjects">
                {d.data.teaching.length === 0 ? (
                  <Empty>You have no classes this session yet.</Empty>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.data.teaching.map((t, i) => (
                      <li key={`${t.classId}-${i}`}>
                        {t.className} · {t.subject}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Announcements">
                {d.data.announcements.length === 0 ? (
                  <Empty>No announcements.</Empty>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.data.announcements.map((p) => (
                      <li key={p.id}>
                        {p.title}
                        {p.publishedAt && (
                          <span className="text-muted">
                            {" "}
                            · {fmtDate(p.publishedAt)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
