# Deployment checklist

Work through this in order. Tick each box only when you have seen it work, not when you have set it. Nothing here has been done yet.

## A. Accounts and names (before you touch code)
- [ ] A domain name for the school, with access to its DNS settings.
- [ ] Plan: site on `www.<domain>` (or the bare domain), API on `api.<domain>`. **Keep both under the same domain.** Sign-in cookies are far more reliable when the site and the API share a registrable domain; across two unrelated domains browsers increasingly block them.
- [ ] Accounts: Supabase (database and file storage), Render (API), Vercel (website), Paystack (payments), Resend (email).

## B. Database and files (Supabase)
- [ ] Create the project, in a region near Lagos users where one is offered. Save the database password in a password manager.
- [ ] Run migrations 001 to 017 in order (see `SETUP-GUIDE.md`). Confirm `citext` and `pgcrypto` exist.
- [ ] Create the **private** storage bucket the app expects. Upload a real file through the app and open it again as a student.
- [ ] Confirm row-level security is on for every table and the app still works (the API uses the server key; the public key must reach nothing).
- [ ] Use the **connection string for the API** that suits Render (the pooled one is fine for the API; use the direct one for backups and migrations).
- [ ] Decide on and turn on backups (see `OPERATIONS.md`). Do one restore drill before launch.

## C. API (Render)
- [ ] New Web Service from the repository, root folder `server`. Build and start commands as in `server/package.json`.
- [ ] Use a paid instance. Free web services go to sleep when idle, so the first parent of the morning waits a long time.
- [ ] Set every variable from `docs/ENVIRONMENT.md` in Render's Environment tab. Fresh secrets, not the local ones.
- [ ] Set the allowed website address (CORS) and cookie settings for production: `Secure` cookies, and `SameSite` suited to your domain plan in section A.
- [ ] Custom domain `api.<domain>` and check HTTPS shows the padlock. Open `https://api.<domain>/api/health` if your API has a health route, or any public API route, and confirm it answers.
- [ ] Add the two **Cron Jobs** from `SETUP-GUIDE.md` section 8 (clean-up, instalment reminders), with the UTC times given there.

## D. Website (Vercel)
- [ ] New project from the repository, root folder `client`. Set the API address variable (`VITE_API_URL`) to `https://api.<domain>`.
- [ ] Add a rewrite so every path serves `index.html` (single-page app), or refreshing `/parent/fees` gives "not found".
- [ ] Add security headers (`vercel.json` `headers`): at least `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a `Content-Security-Policy` that allows your API, Paystack and YouTube embeds. Test the site after adding the policy: a too-strict one breaks pages.
- [ ] Custom domain and HTTPS.

## E. Payments (Paystack)
- [ ] Test mode first: pay with a Paystack test card from a parent account. Confirm the payment appears on the invoice and a receipt exists.
- [ ] Set the webhook URL in the Paystack dashboard to `https://api.<domain>/<your webhook path>` and confirm a test event arrives and is counted exactly once.
- [ ] When the school's business verification is complete: switch the keys to **live**, update the webhook, and make one real small payment. Reverse or refund it after.
- [ ] Remember: refunds and disputes are only flagged for an administrator, they do not change the books by themselves.

## F. Email (Resend)
- [ ] Add and verify the sending domain (the DNS records Resend shows: SPF and DKIM). Add a DMARC record.
- [ ] Send each kind of email to a real inbox, including Gmail: account activation, password reset, fee reminder, receipt, admission update. Check they do not land in spam.

## G. Content and people
- [ ] Replace every `[Placeholder]` on the public site (Section 4 of `REMAINING-WORK.md`).
- [ ] Open the Contact page and check the map lands on the school.
- [ ] Open a lesson with a real YouTube video as a student.
- [ ] Set the printed school details: `SCHOOL_NAME`, `SCHOOL_ADDRESS`, `SCHOOL_PHONE`, `SCHOOL_EMAIL`.

## H. Go-live clean-up
- [ ] Run `tools/preview-test-data.sql` against production. No `@example.com` accounts and no sessions in the year 2100 or later should remain.
- [ ] Only real administrators exist. Everyone changed the first password.
- [ ] Rotate every secret that was ever used on a developer laptop or pasted in chat or email. Redeploy.
- [ ] Remove any demo or seed data the seed script created.
- [ ] Confirm the grading scale and assessment columns with the school, then enter classes, subjects and term dates (Section 4 of `REMAINING-WORK.md`).
- [ ] Confirm the privacy notice has real retention periods and has been read by a lawyer.

## I. After launch (first week)
- [ ] Look at the error tracking and uptime alerts every day (see `OPERATIONS.md`).
- [ ] Check the audit log for anything unexpected.
- [ ] Take a backup before the first results publication and before the first term's fee run.
