import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field } from '../components/ui';
import { api } from '../lib/api';
import { fieldErrors, messageOf } from '../lib/forms';

// One component serves both "activate account" and "reset password": same form, different endpoint and wording.
export default function SetPassword({ mode }: { mode: 'activate' | 'reset' }) {
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const copy = mode === 'activate'
    ? { title: 'Activate your account', intro: 'Choose a password to finish setting up your account.', action: 'Activate account', path: '/auth/activate' }
    : { title: 'Choose a new password', intro: 'You will be signed out of all devices after this.', action: 'Save new password', path: '/auth/reset-password' };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setFields({});
    if (password !== confirm) { setFields({ confirm: 'The two passwords do not match' }); return; }
    setBusy(true);
    try {
      await api(copy.path, { body: { token, password }, auth: false });
      setDone(true);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(messageOf(err));
    } finally { setBusy(false); }
  }

  if (!token) {
    return (
      <AuthLayout title={copy.title}>
        <Alert tone="error">This link is incomplete. Open the full link from your email, or ask the school office for a new one.</Alert>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title={mode === 'activate' ? 'Account activated' : 'Password changed'}>
        <div className="space-y-5">
          <Alert tone="success">You can now sign in with your new password.</Alert>
          <Link to="/login" className="block rounded-lg bg-brand-500 px-4 py-2.5 text-center font-semibold text-white hover:bg-brand-600">Go to sign in</Link>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={copy.title} intro={copy.intro}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" type="password" autoComplete="new-password" value={password} error={fields.password}
               hint="At least 10 characters, with a letter and a number." onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Confirm password" type="password" autoComplete="new-password" value={confirm} error={fields.confirm}
               onChange={(e) => setConfirm(e.target.value)} required />
        <Button type="submit" loading={busy}>{copy.action}</Button>
      </form>
    </AuthLayout>
  );
}
