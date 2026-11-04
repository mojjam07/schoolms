import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field } from '../components/ui';
import { api } from '../lib/api';
import { fieldErrors, messageOf } from '../lib/forms';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try {
      await api('/auth/forgot-password', { body: { email }, auth: false });
      setSent(true);
    } catch (err) {
      setFields(fieldErrors(err)); setError(messageOf(err));
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Reset your password" intro="Enter your email and we will send a reset link if an account exists for it.">
      {sent ? (
        <div className="space-y-5">
          <Alert tone="success">If that email belongs to an account, a reset link is on its way. The link works for 1 hour.</Alert>
          <Link to="/login" className="font-medium text-brand-700 underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" type="email" autoComplete="username" value={email} error={fields.email}
                 onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" loading={busy}>Send reset link</Button>
          <p className="text-sm"><Link className="font-medium text-brand-700 underline" to="/login">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
