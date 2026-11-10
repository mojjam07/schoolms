# Kingdom of Knowledge – School Management and E-Learning

Monorepo: `server/` (Express + PostgreSQL) and `client/` (React + Vite + Tailwind).

## Server setup (Phase 1: foundation)

1. `cd server && npm install`
2. Copy `.env.example` to `.env` and fill it in.
   - `DATABASE_URL`: Supabase > Project Settings > Database > **Session pooler** connection string (IPv4, works on Render).
   - `JWT_ACCESS_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
3. `npm run migrate` creates the tables (RLS is enabled on all of them, so Supabase's public REST API cannot read them).
4. `npm run create-admin -- you@example.com FirstName LastName` prints a one-time activation link. Open it on the frontend `/activate` page to set your password.
5. `npm run dev`

Email goes through Resend when `RESEND_API_KEY` is set (verify your sending domain in Resend and set `MAIL_FROM`). Without a key, links are printed to the server log in development and nothing is sent in production. "Accepted by Resend" is not the same as "delivered to the inbox"; delivery tracking needs Resend webhooks, which are not set up.

## API in this phase

| Method | Path | Access |
|---|---|---|
| GET | /api/health | public |
| POST | /api/auth/login, /refresh, /logout | public (refresh/logout use the httpOnly cookie) |
| GET | /api/auth/me | signed in |
| POST | /api/auth/activate, /forgot-password, /reset-password | public, rate limited |
| GET, POST | /api/users | admin |
| PATCH | /api/users/:id/status | admin (suspend or reactivate) |

Verification: `smoke-test.sh` runs 21 checks (activation, login, role blocking, refresh rotation and reuse detection, suspension, reset). Run it against a freshly migrated local database.

## Known limitations

- Supabase TLS currently uses `rejectUnauthorized: false`; pin Supabase's CA before going live.
- Resend delivery webhooks are not set up, so delivery status is not tracked.

## Client setup

1. `cd client && npm install && npm run dev` (http://localhost:5173; `/api` is proxied to the server on :4000).
2. Production: set `VITE_API_URL` to the API origin on Vercel. Set `CLIENT_ORIGIN` on the server to the exact Vercel URL, since the refresh cookie is `SameSite=None; Secure` there.

Pages so far: home placeholder, sign in, forgot password, activate account, reset password, and an empty dashboard shell for each role (`/admin`, `/teacher`, `/student`, `/parent`) behind role guards.

## Phase 2: academic core (API)

All under `/api`. Reading school structure works for any signed-in user; everything that changes it is admin only.

- `academic/sessions`, `academic/terms` (create, edit, `set-current`; one current session and one current term at a time)
- `academic/classes` (JSS/SSS 1-3 with an optional arm, such as the A in JSS 1A), `academic/subjects`, `PUT academic/classes/:id/subjects`
- `academic/teaching-assignments`, `academic/enrolments` (one class per student per session)
- `students` (directory with search and class filter), `parent-links` (admin links guardians to students; parents cannot edit these)
- Role endpoints scoped to the caller: `parents/me/children`, `teachers/me/assignments`, `students/me/class`
- Creating a student requires `admissionNumber`; a teacher requires `staffNumber`. Both must be unique, with no fixed format.

Test: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase2.test.ts` (API running, DB migrated). 46 checks.
There are no admin screens for these yet; that is the next step.

## Phase 2b: admin screens

Sidebar layout (collapses to a Menu button on phones) at `/admin`: Overview, Sessions and terms, Classes and subjects, Accounts (create, search, suspend, resend activation email), Students and classes, Teaching assignments, Guardians.

Account creation reports whether the email service accepted the activation email. Without a Resend key it says the email was not sent (and, outside production, shows the activation link so you can continue testing).
`POST /api/users/:id/resend-activation` (admin) re-sends for accounts that have not activated yet.

## Phase 3a: lesson notes, files and YouTube lessons

**Teacher** (`/teacher`): My classes, Lesson notes (write, attach files, save as draft, publish or archive), Video lessons (paste a YouTube link, add instructions, publish, unpublish, delete). A teacher can only post to a class and subject they are assigned to in the current session.
**Student** (`/student`): My class, My lessons (video lessons with the YouTube player, lesson notes with downloads, search and subject filter, helpful empty states).

Uploads: PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx), JPG and PNG, up to 10 MB each. The server checks the file's own bytes against its extension, so a renamed .exe or spreadsheet is refused.
Downloads always go through the API, which checks permissions each time (owner, administrator, or a student in the class a published note was shared with). Files are never reachable by a public URL.
YouTube: only the 11-character video ID is stored. Students watch through YouTube's own embedded player (`youtube-nocookie.com`); nothing is downloaded or re-hosted.

**Storage setup for production (Supabase):** create a **private** bucket named `school-files`, then set `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the frontend) and optionally `SUPABASE_BUCKET`. Development uses `STORAGE_DRIVER=local`, which is wiped on redeploy.

Tests: `tests/phase3a.test.ts` (70 checks), `tests/storage.test.ts` (Supabase driver against a fake server), `tests/seed-demo.ts` (demo school).

Known limits: videos and notes are shared with one class at a time (no individual-student sharing yet); orphaned uploads that were never attached to a note are not yet cleaned up automatically; the Supabase driver has not been run against a real Supabase project.

## Phase 3b: assignments

**Teacher** (`/teacher/assignments`): create assignments (class and subject you teach, description, instructions, maximum marks, optional publish time, due time, attachments, resubmission on or off), see handed-in counts and how many are waiting to be marked, open the class list, read each student's work, give marks and feedback, and return it. "Save marks" keeps marks hidden from the student; "Save and return" releases them. Work can also be closed to stop new submissions.
**Student** (`/student/assignments`): a To do list, the task with its attachments, a hand-in form (text and up to 5 files, same file rules as before), a confirmation with the time and whether it was on time, and marks and feedback once the teacher returns the work.

Rules worth knowing:
- Resubmission is **off by default** and is switched on per assignment. When on, a student can replace work until the teacher starts marking; after the teacher returns it, a new attempt is created and earlier marks are kept.
- Late work is accepted until the assignment is closed and is labelled late.
- Students never see marks or feedback until the work is returned. A student can only read their own submission; a teacher only their own assignments; files follow the same rules.
- Marks cannot exceed the maximum, and the maximum cannot be lowered below marks already given.

Tests: `tests/phase3b.test.ts` (65 checks). Not built yet: notifications (new assignment, due soon, marks returned), parent view of assignment progress, and an overall mark book. The teacher cannot yet give marks to a student who has not handed in anything.

## Phase 4: notifications (in-app)

A Notifications page for teachers, students and parents (`/teacher|student|parent/notifications`), with an unread count in the menu (and a "Notices" button on phones). Unread items are bold with a dot; opening one marks it read and goes to the right page; there is "Unread only" and "Mark all as read". The count and the open list refresh every minute and when the tab regains focus.

Who is told what (in-app only, by design: email is kept for important events such as account activation, and later fee reminders and payment confirmations):
- **Students:** a new assignment, a new lesson note, a new video lesson (only once, the first time it is published), a receipt when they hand work in, marks and feedback when returned, and a reminder when an assignment is due within 24 hours and they have not handed anything in.
- **Parents** (linked children only): a new assignment for the child's class, and when the child's work is marked. Not lesson notes or videos.
- A scheduled assignment's notice only appears when the assignment itself becomes visible, and follows the teacher if the time changes.
- Saving marks without returning them tells nobody. Closing and reopening or republishing never notifies twice. Teachers are not notified about every submission (the assignment list shows how many need marking).

Reminders run inside the API every 15 minutes (`src/modules/notifications/notifications.events.ts`). They are idempotent, so more than one API instance is harmless.
The API's notifications endpoints only ever read or change the signed-in user's own notices. A failure while creating a notification is logged and never blocks the teacher's action.

Tests: `tests/phase4.test.ts` (40 checks). Run suites one at a time against a freshly started API: sign-up activation is rate limited to 20 per 15 minutes per address.
Not built yet: announcements and events, absence and attendance notices, exam schedules, tuition reminders and payment notices (these come with those features), a delivery log for email/SMS, and automatic deletion of old read notices.

## Phase 5a: school fees (offline payments)

**Administrator**
- *Fee setup* (`/admin/fees`): fee categories (for example Tuition, Books), the amount each class pays each term, and "Create invoices" for a term (one class or all classes that have fees set). Each student placed in the class for that session gets one invoice per term. Running it again skips students who already have one. Changing fees later does not change invoices already issued. **No fee amounts are pre-filled: the school enters its real ones.**
- *Invoices and payments* (`/admin/invoices`): billed, collected, outstanding and overdue figures for a term, a by-class table, and a searchable invoice list. Open an invoice to add a **discount or extra charge** (a reason is required and kept), **record a payment** (cash, bank transfer, POS or other; a payment can never exceed the balance, and two simultaneous payments cannot both succeed), print a **receipt**, **reverse** a payment (the record stays; a reason is required), set a payment deadline, **cancel** an invoice that has no payments, and send a **reminder** to the parent.
- *Bulk reminders*: "Remind parents who owe" for a term, or a class. A guardian gets at most one reminder per invoice per day.

**Parents** (`/parent/fees`): their own children's invoices, what is owed, the line items, payments, and printable receipts. A parent can never open another family's invoice or receipt. **Students** see their own fee status (read only) on their home page.

Money is stored as whole kobo, never as decimals. Every discount, charge, payment, reversal, cancellation, reminder and invoice run is written to the audit log with who did it.

**Email honesty:** reminders and payment confirmations are always sent in-app. Email is also attempted through Resend when configured, and each attempt is recorded in `notification_deliveries` as `accepted` (the provider took it, which is not proof of delivery), `not_sent` (no provider configured) or `failed`. The screens report these numbers as they are.

Tests: `tests/phase5.test.ts` (71 checks, including simultaneous payments, privacy between families and the audit trail).
**Not built yet:** Paystack online payment (the parent page says plainly that it is unavailable), SMS, refunds through Paystack, instalment plans, and exporting reports to a spreadsheet.

## Phase 5b: Paystack online payment

Parents open an invoice, press **Pay with Paystack** (full balance, or a part payment of at least ₦100), and pay on Paystack's own page by card, bank transfer or USSD. The school never sees card details, and none are stored.

**How a payment is counted (the rules that protect the books)**
1. The server creates a transaction record with a long, random reference *before* sending the parent to Paystack. It asks Paystack for exactly the invoice amount in NGN.
2. When the parent comes back, the browser's word is not trusted. The server asks Paystack directly what happened (`/transaction/verify`), then checks the reference, the currency (NGN) and the amount against what it expected. Only then is a payment added.
3. Paystack's signed **webhook** (`POST /api/webhooks/paystack`) covers parents who close the page. The signature (HMAC-SHA512 of the raw body with your secret key) is checked first; unsigned or altered requests are refused and count nothing.
4. A payment can be counted only once: a row lock, a "already counted" marker on the transaction, and a database unique index on the Paystack reference all enforce it. A repeated webhook, a webhook and a page return arriving together, and a repeated "check status" are all harmless.
5. If the amount or currency does not match, nothing is counted and the transaction is flagged. If money arrives after an office payment lowered the balance, it is recorded in full and flagged "overpaid by ₦X" for you to refund or credit. If money arrives for a cancelled invoice, it is flagged for refund.
6. Disputes and refunds reported by Paystack are logged and flagged on the payment. After refunding in the Paystack dashboard you reverse the payment on the invoice (with a reason), so the books match reality.

**Administrator:** *Online payments* lists every attempt with its status and anything needing attention, a **Check with Paystack** button re-checks a payment whose webhook never arrived, and the page shows the exact webhook URL to enter in Paystack.

### Setting it up (test mode first)
1. Paystack dashboard, Settings, **API Keys & Webhooks**: copy the **test secret key** (`sk_test_...`) into the API's environment as `PAYSTACK_SECRET_KEY`. Server only, never in the frontend. Leave it empty and online payment switches itself off (parents see it is unavailable).
2. On the same page set the **test webhook URL** to `https://YOUR-API-HOST/api/webhooks/paystack`. (To receive webhooks on your own computer you need a tunnel such as ngrok; without it, payments are still counted when the parent returns or when you press Check with Paystack.)
3. Make a payment with one of Paystack's test cards. Check the invoice, the receipt, the Online payments page, and the parent's notifications.
4. **Going live:** after Paystack approves your business, replace the key with the live secret key (`sk_live_...`) and set the webhook URL on the *live* dashboard too. The API logs a warning if a test key is used in production.

### What was and was not verified
Tested against a **fake Paystack** that I wrote (`tests/fake-paystack.ts`): 60 API checks (`tests/phase5b.test.ts`) and a browser walkthrough of paying, returning, closing the tab, failing, and the admin screens. The request and response shapes follow Paystack's documentation, but **nothing has been run against the real Paystack**, because this build environment cannot reach it. Your first test payment is the real check. The refund and dispute webhook handling only logs and flags (it does not move money), because I could not confirm those payloads against the real service.
Not built: SMS, instalment plans, automatic refunds from the app, exporting reports to a spreadsheet.

## Phase 6: public website and content management

**Public pages (no sign-in):** Home, About us, Academics, Facilities (with photo gallery), Admissions (information, online application, status check), News and events, Contact us (with map), Privacy notice, and a Sign in button for students, teachers, parents and administrators (one sign-in page serves all four roles; each lands in their own portal).

**Nothing is invented.** The only facts built in are the school's name, its address, and that it teaches JSS 1-3 and SSS 1-3. Everything else (welcome line, history, mission, vision, philosophy, values, leadership, curriculum, admission requirements, how long data is kept) shows as a clearly labelled **[Placeholder]** until the administrator replaces it. A phone number or email is shown only after the school enters one. The Academics page lists the real subjects configured per class level, and nothing else about staff or students.

**Administrator tools** (sidebar): *Website content* (contact details and the text of each page, with a "before you launch" count of placeholders still showing), *News and events* (news stories with an optional picture, pinned and expiring announcements, events), *Facilities and gallery*, *Applications*, *Messages*. Nothing is public until published, and unpublishing or deleting withdraws it at once. Text is stored and shown as plain text (never as HTML), so pasted markup cannot run on the site. Every picture needs a description for visitors who cannot see it. Publishing an announcement or an event notifies students, parents and teachers in-app once.

**Pictures:** JPG or PNG up to 10 MB, uploaded by administrators only. A picture is served publicly only while a published page uses it; drafts and unpublished items return "not found". Private files (lesson notes, submissions, receipts) can never be reached through the public route.

**Applications and messages:** the forms ask only for what is needed, require the guardian's agreement to the privacy notice, include a hidden spam trap, and are rate limited per connection (20 applications an hour, 30 messages an hour; mobile networks share addresses, so the limits are generous). Sending the same application twice returns the same reference instead of a duplicate. The family checks progress with the reference **and** the guardian's email; a wrong combination gets the same answer as an unknown reference, and the page shows no contact details or private notes. When the administrator changes a status, the guardian is emailed and the result is recorded as it really was ("accepted by the email service", "not sent", or "failed").

**The map:** the Contact page embeds a Google map that searches for the address text (editable under Website content, Contact details). I searched the web for the address: it confirms Mafoluku is a real area of Oshodi-Isolo in Lagos, but I found nothing confirming "13, Sunmonu Street" itself. So **no pin or coordinates are invented**. Please open the Contact page after launch and check the map lands on the school. If it does not, add a nearby landmark to the map search text. Visitors are never asked for their location.

**Privacy notice:** `/privacy` states plainly what the site collects and who sees it, and refers to the Nigeria Data Protection Act 2023. It has one placeholder (how long applications and messages are kept). It is not legal advice: have the school's lawyer review it before launch.

Tests: `tests/phase6.test.ts` (86 API checks), plus a browser walkthrough of the visitor, administrator and phone views.
**Not built yet:** a sitemap and search-engine metadata beyond page titles, a CAPTCHA (the spam trap and rate limits are the only protection), resizing of uploaded pictures (large photos are served as uploaded, so resize big photos before uploading), and converting an accepted applicant into a student account in one click (the administrator creates the account under Accounts).

## Phase 7a: grading, score entry, results and report cards

**Administrator**
- *Grading and assessment* (`/admin/grading`): the **assessment columns** for a session (for example CA 1, CA 2, Exam, each with a maximum; a common 20/20/60 layout is offered as a one-click starting point) and the **grading scale**. A new school starts with neither. A one-click **WAEC-style template (A1 to F9)** is offered and every band can be edited. Each band runs from its "From %" up to the next band's; one must start at 0. Percentages come from the total of all columns, so any layout works.
- *Results* (`/admin/results`): per term, each class's progress (students, subjects with scores, how many are complete, published or not), the class results table, **Publish** and **Unpublish**, and a report-card preview with an optional remark.

**Teachers** (`/teacher/scores`): a score grid for a class and subject they teach, with live totals and grades. Invalid scores are flagged and cannot be saved; if any score is invalid on the server, nothing at all is saved. Once results are published the sheet is **locked** for teachers.

**Students and parents** see a report card only after the administrator publishes it, and they are notified. A parent sees only linked children. Cards are printable.

How results are worked out
- A subject counts for a class and term once anyone has a score in it. A student missing a score in such a subject is **incomplete**: no total for that subject, no overall average, and **no class position** (the card says what is missing).
- Positions use standard competition ranking: equal scores share a place and the next place is skipped (1, 1, 3). Subject positions rank within the class; the overall position ranks by average percentage among students whose subjects are all complete.
- Publishing with incomplete students is stopped and names who is missing what; the administrator can choose "Publish anyway".
- **Published cards keep the grading scale they were published with.** Changing the scale later never rewrites a report card students have already seen.
- After publication only the administrator can correct a score; each correction is written to the audit log with the old and new values and shows on the report card at once.

Tests: `tests/phase7.test.ts` (87 API checks: grading validation, boundaries such as 74.5% = B2 and 75% = A1, ties, incomplete students, publishing rules, privacy between families, locking, corrections, snapshot) plus a browser walkthrough of the full cycle and phone widths.
**Not built yet** (still on your original list): examination schedules and timetables, parent-teacher messaging, CSV student import, results history and progress across terms, and a final security and deployment pass.

## Phase 7b: attendance and absence explanations

**Screens (all built):**
- *Administrator:* **Attendance** (`/admin/attendance`) has four tabs: **Today** (which classes have taken their register on any date, with present/late/absent counts and a link to take or correct each one), **Take or correct a register** (any class, any date, no 7-day limit), **Explanations** (every class) and **Class summaries**. The *Form teachers* page (`/admin/form-teachers`) assigns form teachers.
- *Form teacher:* **Attendance** (`/teacher/attendance`) has **Register**, **Explanations** (accept or decline with an optional note; the tab shows how many are waiting) and **Class summary** (a term's figures per student). The notification a form teacher gets about a new explanation opens the Explanations tab.
- *Parent:* **Attendance** (`/parent/attendance`) with the explanation form and the school's replies.
- *Student:* **Attendance** (`/student/attendance`), read only: the term's figures and the days missed or late.
- *Report card:* an **Attendance** block (school days, present, late, absent, percent) on the student, parent and administrator-preview report card.

- **Daily register, one per class per day, taken by the class's form teacher.** The administrator assigns one form teacher per class per session. Each student is marked present, late or absent. The register must list every active student exactly once; withdrawn students are not on it. A register cannot be taken for a future date or a date outside every term.
- **Corrections:** the form teacher can take or correct a register for 7 days; after that only the administrator can. Every register and every correction is audited, and corrections record what changed.
- **Counting:** "times the school opened" is the number of registers that list the student. *Late counts as present* (they were in school). Percent present is worked out from those.
- **Parents** are told in-app when their child is marked absent or late (once per child per day per status). They can explain an absence, or a late arrival, only for a day the register actually shows it, for their own child only. The form teacher is notified. The form teacher or administrator accepts or declines with a note and the parent is told. An accepted explanation excuses the absence in the figures but the register itself is never altered. A reviewed explanation cannot be edited by the parent. Parents and students cannot change any register.
- **Views (API):** a form teacher's class summary, the administrator's "which registers were taken today" overview, a parent's child summary with the days missed or late and the school's replies, and a student's own record (read only). The report card API now includes the attendance block.

Tests: `tests/phase7b.test.ts` (59 API checks). Run suites one at a time against a freshly started API.
Browser walkthrough: `e2e/attendance.walkthrough.py` (17 checks across the form teacher, another teacher, the administrator, a student on a phone and the report card). Setup is in the file's header: seed with `server/tests/seed-attendance.ts`, then run it with Playwright. It saves screenshots to `e2e/shots/`.

## Phase 8: timetables, exam schedules and new-session promotion

**Timetable** (`/admin/timetable`): lessons per class per session, Monday to Friday. Teachers are not typed in: they come from Teaching assignments for that class and subject. The API refuses a lesson that overlaps another for the same class, or that puts a teacher in two classes at once (`CLASS_CLASH`, `TEACHER_CLASH`). Clashes created later (for example by assigning a teacher to a second class) are listed at the top of the page (`GET /api/timetable/conflicts`). A subject cannot be removed from a class while it is on the timetable or an exam schedule. Students, parents (linked children only) and teachers (only what they teach) have a read-only **Timetable** page.

**Exam schedules** (`/admin/exams`): a schedule belongs to a term and starts as a **draft that nobody but the administrator can see**. Papers are one subject for one class on one date; the date must fall inside the term, and a class cannot have two overlapping papers on a day. Publishing needs at least one paper and notifies the class's students, their parents and the subject teachers, **once**, however often it is unpublished and republished. After publishing, moving a paper's date, time or venue, adding a paper, or removing one notifies the same people; edits to instructions alone do not. A published schedule must be unpublished before it can be deleted. Students and parents see **Examinations** pages and an "Upcoming examinations" card on their dashboards; a student only ever sees papers for the class they were enrolled in during that term.

**New session promotion** (`/admin/rollover`): choose the session to promote from and into (the new session must start later), then **Preview**, then **Run**. The preview is the exact plan and changes nothing.
- JSS 1 to 2 to 3, then SSS 1 to 2 to 3, then graduate. The arm is kept (JSS 1A goes to JSS 2A). If the next class does not exist (typically SSS 1), the preview blocks the run until you pick a class per row or tick *Create missing classes*.
- Per student: **Repeat class** keeps them in the same class; **Leave out** places them nowhere (they keep their old record and can be placed later under Students and classes). Students already placed in the new session are left alone. Withdrawn students are never carried.
- Final-year students are marked `graduated` in the old session. Old-session enrolments are otherwise untouched.
- Form teachers and teaching assignments follow the **class** (JSS 1A gets a form teacher again), not the pupils, and only for teachers whose account is active; the result names anyone skipped. Copying the timetable is optional.
- It runs in one transaction, can be done once per pair of sessions (`ALREADY_DONE`), and is audited. It does not make the new session current and does not create fees or grading columns for it; do those next.
- Promotion does not look at results. Who repeats is the school's decision.

Tests: `tests/phase8.test.ts` (67 API checks). **Not verified in a browser:** the screens compile and build, but nobody has clicked through them.
