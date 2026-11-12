# Setup guide (for a developer)

How to get the project running on a new computer, and where everything lives.

## 1. What you need
- Node.js (the version in `.nvmrc` or `package.json` "engines", if present) and npm
- PostgreSQL 14 or newer, locally or a Supabase project
- Git

## 2. Get the code and install
```bash
git clone <your repository>
cd KOK
cd server && npm install && cd ..
cd client && npm install && cd ..
```

## 3. Environment variables
Create `server/.env` and `client/.env` from the `.env.example` files. The full, always-correct list is generated from the code:
```bash
node tools/env-table.mjs > docs/ENVIRONMENT.md
```
Open `docs/ENVIRONMENT.md`. Every variable marked **no** in the ".env.example" column should be added to the example file.
Groups you will meet: the database connection, token secrets, the web address of the site and of the API (for cookies and CORS), Supabase storage,
Paystack, the email service (Resend), the printed school details (`SCHOOL_*`), and the clean-up periods (`RETENTION_*`).
Generate every secret fresh (at least 32 random characters); never reuse a local secret in production.

## 4. Create the database
Run the migration files in `server/src/db/migrations/` **in number order**, once each, the same way you ran them before:

| File | What it adds |
|---|---|
| 001_foundation | users, sign-in tokens, audit log, settings |
| 002_academic_core | sessions, terms, classes, subjects, enrolments, guardian links, teaching assignments |
| 003_learning | lesson notes, files, video lessons |
| 004_assignments | assignments and submissions |
| 005_notifications | in-app notifications |
| 006_fees | fee setup, invoices, payments |
| 007_paystack | online payments |
| 008_site | public website content, applications, enquiries |
| 009_results | grading, scores, result publications |
| 010_attendance | registers, records, explanations, form teachers |
| 011_schedule | timetables and exam schedules |
| 012_rollover | new-session promotion |
| 013_applicant_convert | turning an applicant into a student |
| 014_messaging | parent and staff messages |
| 015_family_prefs | guardian correction requests, notification preferences |
| 016_quizzes | quizzes |
| 017_instalments | instalment plans |

To check what is applied: `select to_regclass('quizzes'), to_regclass('invoice_instalments');` (a `null` means that file has not been run).
The database needs the `citext` and `pgcrypto` extensions.

## 5. Create the first administrator
Use the project's seed or create-admin command (the one you used locally), with a real email and a strong password. Sign in, then change the password.

## 6. Run it
```bash
cd server && npm run dev      # API, port 4000
cd client && npm run dev      # site, port 5173 (it proxies /api to the API)
```

## 7. Run the checks
Each test suite needs a freshly started API (a sign-up rate limit stops repeated runs):
```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npx tsx server/tests/phase10.test.ts
cd client && npm run build      # type-checks the whole frontend
```
The tests create accounts at `example.com` and sessions in the year 2100 or later. Never run them against the live database
(see `tools/preview-test-data.sql` for finding and removing test data).

## 8. Scheduled jobs (production)
| Job | Command | When (Lagos time) |
|---|---|---|
| Clean-up of old records | `npx tsx src/scripts/retention.ts --apply` | daily, 02:00 |
| Instalment reminders | `npx tsx src/scripts/instalment-reminders.ts --apply` | daily, 07:00 |
Both default to a dry run without `--apply`. On Render, cron schedules are in **UTC**, and Lagos is UTC+1, so 02:00 is `0 1 * * *` and 07:00 is `0 6 * * *`.

## 9. Where things are
- `server/src/modules/<feature>/`: one folder per feature (routes, service)
- `server/src/db/migrations/`: the database, in order
- `server/tests/`: the API checks, one file per phase
- `client/src/pages/<role>/`: screens per role; `client/src/components/`: shared pieces
- `tools/`: helper scripts (environment table, backup, test-data finder)
