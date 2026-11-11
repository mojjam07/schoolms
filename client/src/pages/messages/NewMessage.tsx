import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  DataState,
  Empty,
  Field,
  PageHeader,
  Select,
  TextArea,
} from "../../components/ui";
import { api } from "../../lib/api";
import type { ParentContact, TeacherContact } from "../../lib/types";
import { useAction, useFetch } from "../../lib/useFetch";

export default function NewMessage({ base }: { base: "/parent" | "/teacher" }) {
  const nav = useNavigate();
  const act = useAction();
  const contacts = useFetch<ParentContact[] | TeacherContact[]>(
    "/messages/contacts",
  );
  const [pick, setPick] = useState(""); // parent: "<studentId>|<teacherId or office>"; teacher: "<parentId>|<studentId>"
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const options =
    base === "/parent"
      ? ((contacts.data as ParentContact[] | undefined)?.flatMap((k) => [
          {
            v: `${k.studentId}|office`,
            label: `${k.studentName}: School office`,
          },
          ...k.teachers.map((t) => ({
            v: `${k.studentId}|${t.id}`,
            label: `${k.studentName}: ${t.name} (${t.isFormTeacher ? "form teacher" : t.subjects.join(", ")})`,
          })),
        ]) ?? [])
      : ((contacts.data as TeacherContact[] | undefined)?.map((c) => ({
          v: `${c.parentId}|${c.studentId}`,
          label: `${c.parentName}, parent of ${c.studentName} (${c.className})`,
        })) ?? []);
  const send = async () => {
    const [a, b] = pick.split("|");
    const body =
      base === "/parent"
        ? {
            studentId: a,
            recipientId: b === "office" ? null : b,
            subject,
            body: text,
          }
        : { parentId: a, studentId: b, subject, body: text };
    let newId = "";
    const done = await act.run(async () => {
      const r = await api<{ id: string }>("/messages/threads", { body });
      newId = r.id;
    });
    if (done && newId) nav(`${base}/messages/${newId}`);
  };
  return (
    <>
      <PageHeader
        title="New message"
        intro={
          base === "/parent"
            ? "You can write to the school office, or to teachers who teach your child."
            : "You can write to parents of pupils you teach."
        }
      />
      <DataState loading={contacts.loading} error={contacts.error}>
        {options.length === 0 ? (
          <Empty>There is nobody you can write to yet.</Empty>
        ) : (
          <Card>
            <div className="space-y-4">
              {act.error && <Alert tone="error">{act.error}</Alert>}
              <Select
                label={
                  base === "/parent" ? "Who is this for?" : "Parent or guardian"
                }
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">Choose…</option>
                {options.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Field
                label="Subject"
                maxLength={150}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <TextArea
                label="Message"
                rows={6}
                maxLength={4000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-xs text-muted">
                Messages are kept by the school and may be reviewed by the
                administrators for safeguarding.
              </p>
              <Button
                onClick={send}
                loading={act.busy}
                disabled={!pick || !subject.trim() || !text.trim()}
              >
                Send
              </Button>
            </div>
          </Card>
        )}
      </DataState>
    </>
  );
}
