import { Link } from "react-router-dom";
import { Card, DataState, Empty, PageHeader } from "../../components/ui";
import type { TeacherAssignment } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

export default function TeacherHome() {
  const a = useFetch<TeacherAssignment[]>("/teachers/me/assignments");
  return (
    <>
      <PageHeader
        title="My classes"
        intro="The classes and subjects you teach this session. You can post lesson notes and video lessons for these."
      />
      <Card>
        <DataState loading={a.loading} error={a.error}>
          {a.data?.length ? (
            <ul className="divide-y divide-line">
              {a.data.map((x) => (
                <li
                  key={x.id}
                  className="flex items-center justify-between py-3"
                >
                  <span className="font-medium">{x.className}</span>
                  <span className="text-muted">{x.subjectName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              You have not been assigned any classes yet. The school
              administrator assigns these.
            </Empty>
          )}
        </DataState>
        {!!a.data?.length && (
          <p className="mt-4 text-sm">
            <Link
              className="font-medium text-brand-700 underline"
              to="/teacher/notes"
            >
              Write a lesson note
            </Link>{" "}
            or{" "}
            <Link
              className="font-medium text-brand-700 underline"
              to="/teacher/videos"
            >
              add a video lesson
            </Link>
            .
          </p>
        )}
      </Card>
    </>
  );
}
