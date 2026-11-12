import { useState } from "react";
import { Card, DataState, PageHeader, Select } from "../../components/ui";
import { ExamList, TimetableView } from "../../components/schedule/parts";
import type { ExamPaper, TimetableData } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

export function StudentTimetable() {
  const t = useFetch<TimetableData>("/students/me/timetable");
  return (
    <>
      <PageHeader
        title="Timetable"
        intro={
          t.data?.className
            ? `${t.data.className} · ${t.data.session?.name} session`
            : undefined
        }
      />
      <DataState loading={t.loading} error={t.error}>
        {t.data?.className ? (
          <TimetableView entries={t.data.entries} />
        ) : (
          <Card>
            <p className="text-sm text-muted">
              You have not been placed in a class for this session yet.
            </p>
          </Card>
        )}
      </DataState>
    </>
  );
}

export function StudentExams() {
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const e = useFetch<ExamPaper[]>(`/students/me/exams?scope=${scope}`);
  return (
    <>
      <PageHeader
        title="Examinations"
        intro="Dates, times and venues published by the school."
      />
      <div className="mb-4 max-w-xs">
        <Select
          label="Show"
          value={scope}
          onChange={(ev) => setScope(ev.target.value as "upcoming" | "all")}
        >
          <option value="upcoming">Upcoming only</option>
          <option value="all">All, including past</option>
        </Select>
      </div>
      <Card>
        <DataState loading={e.loading && !e.data} error={e.error}>
          <ExamList
            papers={e.data ?? []}
            emptyText="No examinations have been published for you yet."
          />
        </DataState>
      </Card>
    </>
  );
}
