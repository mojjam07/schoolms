import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loading, Page } from "./Shared";
import { Alert, Button, Field, TextArea } from "../../components/ui";
import { api } from "../../lib/api";
import type { SiteData } from "../../lib/types";
import { usePageTitle } from "../../lib/usePageTitle";
import { useAction, usePublic } from "../../lib/useFetch";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  consent: false,
  website: "",
};

export default function Contact() {
  usePageTitle("Contact us");
  const s = usePublic<SiteData>("/public/site");
  const [f, setF] = useState(EMPTY);
  const act = useAction();
  const [sent, setSent] = useState(false);
  if (!s.data) return <Loading loading={s.loading} error={s.error} />;
  const { contact, school } = s.data;
  const q = encodeURIComponent(contact.mapQuery);
  const set = (k: keyof typeof EMPTY, v: string | boolean) =>
    setF({ ...f, [k]: v });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: f.name,
      email: f.email,
      subject: f.subject,
      message: f.message,
      consent: f.consent,
      website: f.website,
      ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
    };
    if (await act.run(() => api("/public/contact", { body, auth: false }))) {
      setSent(true);
      setF(EMPTY);
    }
  }
  const er = act.fields;
  return (
    <Page title="Contact us">
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="find-h">
          <h2 id="find-h" className="mb-3 font-display text-2xl font-bold">
            Find us
          </h2>
          <address className="not-italic">
            {school.name}
            <br />
            {school.address}
          </address>
          <ul className="mt-3 space-y-1">
            {contact.phone && (
              <li>
                Phone:{" "}
                <a
                  className="font-medium text-brand-700 underline"
                  href={`tel:${contact.phone.replace(/\s/g, "")}`}
                >
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.whatsapp && <li>WhatsApp: {contact.whatsapp}</li>}
            {contact.email && (
              <li>
                Email:{" "}
                <a
                  className="font-medium text-brand-700 underline"
                  href={`mailto:${contact.email}`}
                >
                  {contact.email}
                </a>
              </li>
            )}
            {contact.officeHours && <li>{contact.officeHours}</li>}
          </ul>
          {!contact.phone && !contact.email && (
            <p className="mt-3 text-sm text-muted">
              Please use the form to send us a message.
            </p>
          )}
          <div className="mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-brand-50">
            <iframe
              title={`Map showing ${school.name}`}
              src={`https://www.google.com/maps?q=${q}&output=embed`}
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <a
              className="font-medium text-brand-700 underline"
              href={`https://www.google.com/maps/search/?api=1&query=${q}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Maps
            </a>
            <a
              className="font-medium text-brand-700 underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${q}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions
            </a>
          </p>
          <p className="mt-2 text-xs text-muted">
            The map searches for our address. It does not ask for your location.
          </p>
        </section>
        <section aria-labelledby="msg-h">
          <h2 id="msg-h" className="mb-3 font-display text-2xl font-bold">
            Send us a message
          </h2>
          {sent ? (
            <Alert tone="success">
              Thank you. Your message has been received and the school will
              reply to your email address.
            </Alert>
          ) : (
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <Field
                label="Your name"
                autoComplete="name"
                value={f.name}
                error={er.name}
                onChange={(e) => set("name", e.target.value)}
              />
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                value={f.email}
                error={er.email}
                onChange={(e) => set("email", e.target.value)}
              />
              <Field
                label="Phone number (optional)"
                type="tel"
                autoComplete="tel"
                value={f.phone}
                error={er.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              <Field
                label="Subject"
                value={f.subject}
                error={er.subject}
                onChange={(e) => set("subject", e.target.value)}
              />
              <TextArea
                label="Message"
                rows={6}
                value={f.message}
                error={er.message}
                onChange={(e) => set("message", e.target.value)}
              />
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
              >
                <label>
                  Leave this empty
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={f.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-brand-500"
                    checked={f.consent}
                    onChange={(e) => set("consent", e.target.checked)}
                  />
                  <span>
                    I agree that the school may use these details to reply to
                    me, as explained in the{" "}
                    <Link
                      className="font-medium text-brand-700 underline"
                      to="/privacy"
                      target="_blank"
                    >
                      privacy notice
                    </Link>
                    .
                  </span>
                </label>
                {er.consent && (
                  <p className="mt-1.5 text-sm text-red-700">{er.consent}</p>
                )}
              </div>
              {act.error && <Alert tone="error">{act.error}</Alert>}
              <div className="max-w-xs">
                <Button type="submit" loading={act.busy}>
                  Send message
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </Page>
  );
}
