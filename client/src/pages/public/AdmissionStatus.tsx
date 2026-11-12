import { useState, type FormEvent } from "react";
import { Page } from "./Shared";
import { Alert, Badge, Button, Card, Field } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import type { AppStatus } from "../../lib/types";
import { usePageTitle } from "../../lib/usePageTitle";
import { useAction } from "../../lib/useFetch";

export default function AdmissionStatus() {
  usePageTitle("Check an application");
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [r, setR] = useState<AppStatus | null>(null);
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setR(null);
    let data: AppStatus | undefined;
    if (
      await act.run(async () => {
        data = await api<AppStatus>("/public/admissions/status", {
          body: { reference: reference.trim().toUpperCase(), email },
          auth: false,
        });
      })
    )
      setR(data!);
  }
  return (
    <Page
      title="Check an application"
      intro="Enter the reference we gave you and the email address used on the application."
    >
      <form onSubmit={submit} className="grid max-w-md gap-4" noValidate>
        <Field
          label="Reference"
          placeholder="KOK-APP-000123"
          autoCapitalize="characters"
          value={reference}
          error={act.fields.reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Field
          label="Email address"
          type="email"
          value={email}
          error={act.fields.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {act.error && !Object.keys(act.fields).length && (
          <Alert tone="error">{act.error}</Alert>
        )}
        <Button type="submit" loading={act.busy}>
          Check progress
        </Button>
      </form>
      {r && (
        <div className="max-w-xl">
          <Card
            title={`${r.applicantFirstName}'s application for ${r.applyingFor}`}
          >
            <p className="text-lg">
              <Badge
                tone={
                  r.status === "offered"
                    ? "good"
                    : r.status === "declined"
                      ? "bad"
                      : "warn"
                }
              >
                {r.statusLabel}
              </Badge>
            </p>
            {r.note && (
              <p className="mt-3 whitespace-pre-line rounded-lg bg-brand-50 p-3">
                {r.note}
              </p>
            )}
            <p className="mt-3 text-sm text-muted">
              Reference {r.reference} · received {fmtDateTime(r.submittedAt)} ·
              last updated {fmtDateTime(r.updatedAt)}
            </p>
          </Card>
        </div>
      )}
    </Page>
  );
}
