import { env, isProd } from '../config/env';

export interface Mail { to: string; subject: string; text: string }

// "accepted" means Resend took the message for sending. It does not confirm inbox delivery;
// that would need Resend's delivery webhooks, which are not set up.
export type MailResult = { accepted: boolean; id?: string; reason?: string };

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!env.RESEND_API_KEY) {
    if (isProd) console.warn(`[mailer] RESEND_API_KEY is not set; "${mail.subject}" to ${mail.to} was NOT sent.`);
    else console.log(`\n[mailer:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return { accepted: false, reason: 'no_provider' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[mailer] Resend rejected email (${res.status}):`, body?.message ?? body);
      return { accepted: false, reason: `resend_${res.status}` };
    }
    return { accepted: true, id: body.id };
  } catch (err) {
    console.error('[mailer] Could not reach Resend:', (err as Error).message);
    return { accepted: false, reason: 'network' };
  }
}
