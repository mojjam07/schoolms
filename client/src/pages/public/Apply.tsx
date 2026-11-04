import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Page } from './Shared';
import { Alert, Button, Field, Select, TextArea } from '../../components/ui';
import { api } from '../../lib/api';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAction } from '../../lib/useFetch';

const EMPTY = { firstName: '', lastName: '', dateOfBirth: '', klass: 'JSS|1', previousSchool: '', guardianName: '', guardianPhone: '', guardianEmail: '', address: '', message: '', consent: false, website: '' };
const CLASSES = ['JSS|1', 'JSS|2', 'JSS|3', 'SSS|1', 'SSS|2', 'SSS|3'];

// A short form that asks only for what the school needs to consider the application.
export default function Apply() {
  usePageTitle('Apply for admission');
  const [f, setF] = useState(EMPTY); const act = useAction();
  const [done, setDone] = useState<{ reference: string | null; emailAccepted: boolean; duplicate: boolean } | null>(null);
  const set = (k: keyof typeof EMPTY, v: string | boolean) => setF({ ...f, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const [classStage, year] = f.klass.split('|');
    const body: Record<string, unknown> = { firstName: f.firstName, lastName: f.lastName, dateOfBirth: f.dateOfBirth, classStage, classYear: Number(year), guardianName: f.guardianName, guardianPhone: f.guardianPhone, guardianEmail: f.guardianEmail, consent: f.consent, website: f.website };
    for (const k of ['previousSchool', 'address', 'message'] as const) if (f[k].trim()) body[k] = f[k].trim();
    let r: typeof done = null;
    if (await act.run(async () => { r = await api('/public/admissions/apply', { body, auth: false }); })) setDone(r);
  }

  if (done) {
    return (
      <Page title="Application received">
        <div className="max-w-2xl space-y-4">
          {done.reference ? (
            <>
              <Alert tone="success">{done.duplicate ? 'We already had this application, so nothing new was created.' : 'Thank you. Your application has been received.'}</Alert>
              <p>Your reference is <strong className="text-xl">{done.reference}</strong>. Please write it down: you need it, with the guardian's email address, to check progress.</p>
              <p className="text-muted">{done.emailAccepted ? 'We have also sent it to the guardian\'s email address.' : 'We could not send a confirmation email, so please keep the reference above.'}</p>
              <p><Link className="font-medium text-brand-700 underline" to="/admissions/status">Check an application</Link></p>
            </>
          ) : <Alert tone="success">Thank you. Your application has been received.</Alert>}
        </div>
      </Page>
    );
  }
  const er = act.fields;
  return (
    <Page title="Apply for admission" intro="Please fill in this form for one child. A parent or guardian should complete it.">
      <form onSubmit={submit} className="grid max-w-3xl gap-5" noValidate>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-display text-xl font-bold">The child</legend>
          <Field label="First name" autoComplete="off" value={f.firstName} error={er.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <Field label="Last name" autoComplete="off" value={f.lastName} error={er.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <Field label="Date of birth" type="date" value={f.dateOfBirth} error={er.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          <Select label="Class applying for" value={f.klass} error={er.classStage ?? er.classYear} onChange={(e) => set('klass', e.target.value)}>{CLASSES.map((c) => <option key={c} value={c}>{c.replace('|', ' ')}</option>)}</Select>
          <div className="sm:col-span-2"><Field label="Previous school (optional)" value={f.previousSchool} error={er.previousSchool} onChange={(e) => set('previousSchool', e.target.value)} /></div>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-display text-xl font-bold">Parent or guardian</legend>
          <Field label="Full name" autoComplete="name" value={f.guardianName} error={er.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
          <Field label="Phone number" type="tel" autoComplete="tel" value={f.guardianPhone} error={er.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} />
          <div className="sm:col-span-2"><Field label="Email address" type="email" autoComplete="email" value={f.guardianEmail} error={er.guardianEmail} hint="We send the reference and any updates to this address." onChange={(e) => set('guardianEmail', e.target.value)} /></div>
          <div className="sm:col-span-2"><Field label="Home address (optional)" autoComplete="street-address" value={f.address} error={er.address} onChange={(e) => set('address', e.target.value)} /></div>
        </fieldset>
        <TextArea label="Anything else you would like us to know (optional)" rows={4} value={f.message} error={er.message} onChange={(e) => set('message', e.target.value)} />
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Leave this empty<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} /></label></div>
        <div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-500" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={!!er.consent} />
            <span>I am the child's parent or guardian. I agree that the school may use these details to consider this application and contact me about it, as explained in the <Link className="font-medium text-brand-700 underline" to="/privacy" target="_blank">privacy notice</Link>.</span></label>
          {er.consent && <p className="mt-1.5 text-sm text-red-700">{er.consent}</p>}
        </div>
        {act.error && <Alert tone="error">{act.error}</Alert>}
        <div className="max-w-xs"><Button type="submit" loading={act.busy}>Send application</Button></div>
      </form>
    </Page>
  );
}
