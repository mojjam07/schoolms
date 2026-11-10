import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Card,
  DataState,
  Empty,
  Field,
  PageHeader,
  Select,
  SmallButton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";
import type {
  Account,
  Paged,
  SchoolClass,
  Session,
  Subject,
} from "../../lib/types";
import { useAction, useFetch } from "../../lib/useFetch";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const PERIODS = Array.from({ length: 10 }, (_, i) => i + 1);

type TimetableEntry = {
  id?: string;
  dayOfWeek: number;
  periodNumber: number;
  subjectId: string;
  teacherId: string | null;
};
type ExamEntry = {
  id?: string;
  subjectId: string;
  examDate: string;
  startsAt: string;
  durationMinutes: number;
  venue: string;
};

export default function Timetables() {
  const sessions = useFetch<Session[]>("/academic/sessions");
  const current =
    sessions.data?.find((s) => s.isCurrent) ?? sessions.data?.[0] ?? null;
  const classes = useFetch<SchoolClass[]>("/academic/classes");
  const teachers = useFetch<Paged<Account>>("/users?role=teacher&pageSize=100");
  const [classId, setClassId] = useState("");
  const subjectList = useFetch<Subject[]>(
    classId ? `/academic/classes/${classId}/subjects` : null,
  );
  const timetable = useFetch<TimetableEntry[]>(
    current && classId
      ? `/academic/timetable?sessionId=${current.id}&classId=${classId}`
      : null,
  );
  const exams = useFetch<ExamEntry[]>(
    current && classId
      ? `/academic/exam-schedule?sessionId=${current.id}&classId=${classId}`
      : null,
  );
  const saveTT = useAction();
  const saveExam = useAction();
  const [ttEntries, setTtEntries] = useState<TimetableEntry[]>([]);
  const [examEntries, setExamEntries] = useState<ExamEntry[]>([]);
  const [ttForm, setTtForm] = useState({
    dayOfWeek: "1",
    periodNumber: "1",
    subjectId: "",
    teacherId: "",
  });
  const [examForm, setExamForm] = useState({
    subjectId: "",
    examDate: "",
    startsAt: "09:00",
    durationMinutes: "120",
    venue: "School hall",
  });

  useEffect(() => {
    setTtEntries(timetable.data ?? []);
  }, [timetable.data]);
  useEffect(() => {
    setExamEntries(exams.data ?? []);
  }, [exams.data]);
  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classId, classes.data]);

  const className = useMemo(
    () => classes.data?.find((c) => c.id === classId)?.name ?? "",
    [classes.data, classId],
  );

  function addTimetableEntry(e: FormEvent) {
    e.preventDefault();
    if (!classId || !ttForm.subjectId) return;
    const next: TimetableEntry = {
      dayOfWeek: Number(ttForm.dayOfWeek),
      periodNumber: Number(ttForm.periodNumber),
      subjectId: ttForm.subjectId,
      teacherId: ttForm.teacherId || null,
    };
    setTtEntries((prev) => {
      const existing = prev.filter(
        (item) =>
          item.dayOfWeek === next.dayOfWeek &&
          item.periodNumber === next.periodNumber,
      );
      return [...existing, next].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber,
      );
    });
    setTtForm((prev) => ({ ...prev, subjectId: "", teacherId: "" }));
  }

  function addExamEntry(e: FormEvent) {
    e.preventDefault();
    if (!classId || !examForm.subjectId || !examForm.examDate) return;
    const next: ExamEntry = {
      subjectId: examForm.subjectId,
      examDate: examForm.examDate,
      startsAt: examForm.startsAt,
      durationMinutes: Number(examForm.durationMinutes),
      venue: examForm.venue.trim() || "School hall",
    };
    setExamEntries((prev) =>
      [...prev, next].sort(
        (a, b) =>
          a.examDate.localeCompare(b.examDate) ||
          a.startsAt.localeCompare(b.startsAt),
      ),
    );
    setExamForm((prev) => ({
      ...prev,
      subjectId: "",
      examDate: "",
      startsAt: prev.startsAt,
      durationMinutes: prev.durationMinutes,
      venue: prev.venue,
    }));
  }

  async function saveTimetable() {
    if (!current || !classId) return;
    if (
      await saveTT.run(() =>
        api("/academic/timetable", {
          method: "PUT",
          body: { sessionId: current.id, classId, entries: ttEntries },
        }),
      )
    ) {
      timetable.reload();
    }
  }

  async function saveExamSchedule() {
    if (!current || !classId) return;
    if (
      await saveExam.run(() =>
        api("/academic/exam-schedule", {
          method: "PUT",
          body: { sessionId: current.id, classId, entries: examEntries },
        }),
      )
    ) {
      exams.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Timetables and exams"
        intro={
          current
            ? `Plan the timetable and exam calendar for ${current.name}.`
            : "Set up a current session before scheduling classes and exams."
        }
      />
      {!sessions.loading && !current && (
        <div className="mb-4">
          <Alert tone="error">
            No current session exists yet. Create one under Sessions and terms
            first.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="Class plan">
          <Select
            label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={!classes.data?.length}
          >
            <option value="">Choose a class</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {!classId && (
            <div className="mt-4">
              <Empty>No class selected yet.</Empty>
            </div>
          )}
          {classId && (
            <>
              <div className="mt-6 space-y-6">
                <form
                  onSubmit={addTimetableEntry}
                  className="grid gap-4 rounded-lg border border-line p-4 md:grid-cols-4"
                  noValidate
                >
                  <Select
                    label="Day"
                    value={ttForm.dayOfWeek}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, dayOfWeek: e.target.value })
                    }
                  >
                    {DAY_NAMES.map((day, index) => (
                      <option key={day} value={index + 1}>
                        {day}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Period"
                    value={ttForm.periodNumber}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, periodNumber: e.target.value })
                    }
                  >
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Subject"
                    value={ttForm.subjectId}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, subjectId: e.target.value })
                    }
                  >
                    <option value="">Choose subject</option>
                    {subjectList.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Teacher (optional)"
                    value={ttForm.teacherId}
                    onChange={(e) =>
                      setTtForm({ ...ttForm, teacherId: e.target.value })
                    }
                  >
                    <option value="">No teacher yet</option>
                    {teachers.data?.items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </Select>
                  <div className="md:col-span-4">
                    <Button type="submit" disabled={!ttForm.subjectId}>
                      Add timetable slot
                    </Button>
                  </div>
                </form>
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-bold">
                      Current timetable
                    </h3>
                    {ttEntries.length > 0 && (
                      <SmallButton
                        onClick={() => setTtEntries([])}
                        tone="danger"
                      >
                        Clear
                      </SmallButton>
                    )}
                  </div>
                  <DataState
                    loading={timetable.loading}
                    error={timetable.error}
                  >
                    {ttEntries.length ? (
                      <Table>
                        <thead>
                          <tr>
                            <Th>Day</Th>
                            <Th>Period</Th>
                            <Th>Subject</Th>
                            <Th>Teacher</Th>
                            <Th />
                          </tr>
                        </thead>
                        <tbody>
                          {ttEntries.map((entry, index) => {
                            const subject = subjectList.data?.find(
                              (s) => s.id === entry.subjectId,
                            );
                            const teacher = teachers.data?.items.find(
                              (t) => t.id === entry.teacherId,
                            );
                            return (
                              <tr
                                key={`${entry.dayOfWeek}-${entry.periodNumber}-${index}`}
                              >
                                <Td>{DAY_NAMES[entry.dayOfWeek - 1]}</Td>
                                <Td>{entry.periodNumber}</Td>
                                <Td>{subject?.name ?? "Unknown subject"}</Td>
                                <Td>
                                  {teacher
                                    ? `${teacher.firstName} ${teacher.lastName}`
                                    : "—"}
                                </Td>
                                <Td className="text-right">
                                  <SmallButton
                                    tone="danger"
                                    onClick={() =>
                                      setTtEntries((prev) =>
                                        prev.filter((_, i) => i !== index),
                                      )
                                    }
                                  >
                                    Remove
                                  </SmallButton>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    ) : (
                      <Empty>
                        No timetable entries yet. Add one or more slots for this
                        class.
                      </Empty>
                    )}
                  </DataState>
                  {saveTT.error && (
                    <div className="mt-3">
                      <Alert tone="error">{saveTT.error}</Alert>
                    </div>
                  )}
                  <div className="mt-4 max-w-xs">
                    <Button
                      onClick={saveTimetable}
                      loading={saveTT.busy}
                      disabled={!ttEntries.length}
                    >
                      Save timetable
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card title="Examination schedule">
          {!classId ? (
            <Empty>Select a class to plan exams.</Empty>
          ) : (
            <div className="space-y-6">
              <form
                onSubmit={addExamEntry}
                className="grid gap-4 rounded-lg border border-line p-4"
                noValidate
              >
                <Select
                  label="Subject"
                  value={examForm.subjectId}
                  onChange={(e) =>
                    setExamForm({ ...examForm, subjectId: e.target.value })
                  }
                >
                  <option value="">Choose a subject</option>
                  {subjectList.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Exam date"
                    type="date"
                    value={examForm.examDate}
                    onChange={(e) =>
                      setExamForm({ ...examForm, examDate: e.target.value })
                    }
                  />
                  <Field
                    label="Starts at"
                    type="time"
                    value={examForm.startsAt}
                    onChange={(e) =>
                      setExamForm({ ...examForm, startsAt: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Duration (minutes)"
                    type="number"
                    min={15}
                    step={15}
                    value={examForm.durationMinutes}
                    onChange={(e) =>
                      setExamForm({
                        ...examForm,
                        durationMinutes: e.target.value,
                      })
                    }
                  />
                  <Field
                    label="Venue"
                    value={examForm.venue}
                    onChange={(e) =>
                      setExamForm({ ...examForm, venue: e.target.value })
                    }
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!examForm.subjectId || !examForm.examDate}
                >
                  Add exam
                </Button>
              </form>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-bold">
                    Exam calendar
                  </h3>
                  {examEntries.length > 0 && (
                    <SmallButton
                      onClick={() => setExamEntries([])}
                      tone="danger"
                    >
                      Clear
                    </SmallButton>
                  )}
                </div>
                <DataState loading={exams.loading} error={exams.error}>
                  {examEntries.length ? (
                    <Table>
                      <thead>
                        <tr>
                          <Th>Subject</Th>
                          <Th>Date</Th>
                          <Th>Time</Th>
                          <Th>Venue</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody>
                        {examEntries.map((entry, index) => {
                          const subject = subjectList.data?.find(
                            (s) => s.id === entry.subjectId,
                          );
                          return (
                            <tr
                              key={`${entry.subjectId}-${entry.examDate}-${entry.startsAt}-${index}`}
                            >
                              <Td>{subject?.name ?? "Unknown subject"}</Td>
                              <Td>{entry.examDate}</Td>
                              <Td>
                                {entry.startsAt} ({entry.durationMinutes}m)
                              </Td>
                              <Td>{entry.venue}</Td>
                              <Td className="text-right">
                                <SmallButton
                                  tone="danger"
                                  onClick={() =>
                                    setExamEntries((prev) =>
                                      prev.filter((_, i) => i !== index),
                                    )
                                  }
                                >
                                  Remove
                                </SmallButton>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  ) : (
                    <Empty>No exam dates entered yet.</Empty>
                  )}
                </DataState>
                {saveExam.error && (
                  <div className="mt-3">
                    <Alert tone="error">{saveExam.error}</Alert>
                  </div>
                )}
                <div className="mt-4 max-w-xs">
                  <Button
                    onClick={saveExamSchedule}
                    loading={saveExam.busy}
                    disabled={!examEntries.length}
                  >
                    Save exam schedule
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      {className && (
        <p className="mt-6 text-sm text-muted">
          This schedule applies to {className} in the selected session.
        </p>
      )}
    </>
  );
}
