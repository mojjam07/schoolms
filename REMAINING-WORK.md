# Kingdom of Knowledge: what remains

Sizes: **S** = under a day, **M** = a few days, **L** = a week or more. They are rough guides for one developer.

## Where the project stands

> Update: timetables, exam schedules and session promotion were added in Phase 8. The new screens were type-checked and built, and the API was tested (67 checks), but they have **not been opened in a browser yet**.

**Built and tested locally** (React + TypeScript frontend, Express API, PostgreSQL):

- Sign-in, password reset, account activation, four roles, role checks on every endpoint
- Sessions, terms, classes, subjects, students, teachers, parents and guardian links, with admin screens
- Lesson notes, file uploads, YouTube lessons, assignments, submissions, marking and feedback
- In-app notifications
- School fees: fee setup, invoices, discounts, offline payments, receipts, reports, reminders
- Paystack online payment (tested against a fake Paystack only)
- Public website with an editable content system, admission applications and a contact form
- Grading, score entry, results and report cards
- Timetables, exam schedules (draft, publish, notifications) and the new-session promotion, with screens for all four roles
- Attendance: the full rules in the API and all screens (form teacher register, review queue and class summary; administrator daily overview, register for any class and date, review queue and class summary; parent page; student page; attendance on the report card)

**Automated checks:** 658 API checks across 11 suites, plus browser walkthroughs for each feature.

**Important caveat:** everything has been run only against a local PostgreSQL and fake versions of Supabase storage, Paystack and email. Nothing has been run against the real services or deployed yet (see section 3).

---

## 1. Finish attendance: DONE (all six screens built and walked through in a browser)

- [x] **S** Review queue for absence explanations: the form teacher and the administrator accept or decline with a note. The parent already sees the reply.
- [x] **S** Administrator's daily overview: which classes have had their register taken today, and the counts.
- [x] **S** Administrator register page: take or correct a register for any class, including ones older than 7 days.
- [x] **S** Class attendance summary table for a term (form teacher and administrator).
- [x] **S** Student's own attendance page (read only).
- [x] **S** Show the attendance figures on the report card page (the API already returns them).

## 2. Features in your spec that are not built yet

### Academic and school management

- [x] **M** **Timetables and examination schedules.** DONE (see README, Phase 8). Administrators build them; students, parents and teachers view them; "Upcoming examinations" shows on the student and parent dashboards. Not done: invigilator assignment and exam seating.
- [x] **M** **Promotion and new-session rollover.** DONE (see README, Phase 8). Preview, then run once: moves students up, graduates the final year, handles repeaters and leavers, carries over form teachers, teaching assignments and optionally the timetable. Fees and grading columns for the new session are still set up by hand.
- [ ] **M** **Quizzes and tests.** The spec says "manage permitted quizzes and tests". Only assignments and score entry exist.
- [ ] **M** **Results history.** Progress across terms, plus an annual or cumulative result.
- [ ] **M** **CSV import of students.** Validated, with a dry run and an error report.
- [ ] **M** **Edit existing people.** Names, phone numbers, admission and staff numbers, date of birth, email. Today an account can only be created, suspended or reactivated.

### Parents and communication

- [ ] **L** **Parent–teacher and parent–staff messaging.** Threads, tracking of enquiries, replies, teacher contact details protected, and safeguarding rules.
- [ ] **S** **Parents can see their child's assignments** and deadlines. Parents currently get results, fees and attendance, but not assignments.
- [ ] **M** **Family account management.** Update contact details, notification preferences, and request corrections to guardian relationships (which an administrator verifies).
- [ ] **M** **Notification preferences.** Choose what to receive. Email delivery tracking exists only for fee and admission emails.
- [ ] **M** **SMS** (optional in your spec).

### Dashboards

- [ ] **M** **Administrator overview** as specced:
  - students by class
  - pending assignments and submissions
  - recent admissions
  - tuition collected versus outstanding
  - recent announcements
  - recent administrator actions
- [ ] **S** **Audit log viewer.** The log is written everywhere but cannot be read in the app.
- [ ] **M** **Teacher dashboard.** Upcoming assignments, work waiting to be marked, announcements, resources. It currently shows only classes.
- [ ] **M** **Student and parent dashboards** as one overview page. This is currently spread across separate pages.

### Teaching content

- [ ] **S** Share a lesson note or video with several classes at once, or with individual students. Today it is one class per item.
- [ ] **S** Student view of "completion status" of assignments.

### Money

- [ ] **S** Export financial reports to CSV or Excel.
- [ ] **M** Instalment plans.
- [ ] **S** Receipts and report cards as downloadable PDFs (today they print from the browser).

### Public website

- [ ] **S** Search-engine basics: sitemap and metadata beyond page titles.
- [ ] **S** CAPTCHA on the application and contact forms (only a hidden trap and rate limits exist).
- [ ] **S** Resize uploaded pictures automatically, so large photos do not slow pages.
- [ ] **S** One-click "convert accepted applicant into a student account".
- [ ] **S** Logo and favicon (the site uses the school name as text).

---

## 3. Needed before real use

### 3a. Check against the real services (never done)

- [ ] **S** **Supabase.** Run the migrations on your project. Create the private storage bucket and upload a real file end to end. Confirm the extensions (`citext`, `pgcrypto`) are available and that row-level security does not get in the way.
- [ ] **S** **Paystack.** Make a real test payment with your test keys. Set the webhook URL and confirm a webhook arrives and is counted. Check refund and dispute event shapes (they only log and flag today).
- [ ] **S** **Resend.** Verify your sending domain, then check activation, reminder, receipt and admission emails really arrive.
- [ ] **S** **YouTube embeds.** Confirm a real video plays in the student page.
- [ ] **S** **The map.** Open the Contact page and confirm it lands on the school. The address could not be confirmed by search.
- [ ] **M** **Deploy:**
  - backend on Render, frontend on Vercel
  - cross-site cookies and CORS
  - HTTPS
  - environment variables
  - a custom domain

### 3b. Security and privacy hardening

- [ ] **S** Run a dependency vulnerability audit and update packages.
- [ ] **S** Pin Supabase's certificate. The database connection currently skips certificate verification.
- [ ] **M** Move rate limiting to a shared store (it is in memory, so it resets on restart and is per instance).
- [ ] **S** Add security headers and a content-security policy on the frontend host.
- [ ] **M** Review sessions, idle timeout, lockout after repeated failures, and optional two-step sign-in.
- [ ] **M** Scan uploads for malware, and guard against oversized or malicious images.
- [ ] **M** **Data-protection tooling.** Data export and deletion on request, a retention schedule, and automatic cleanup of old notifications, unattached uploads and old applications.
- [ ] **S** Write down and rehearse backups and recovery (Supabase backups).
- [ ] **S** Error tracking and monitoring.
- [ ] **M** Accessibility audit: keyboard use, screen readers, colour contrast.
- [ ] **S** Load check on the busiest pages (results day, fee reminders).

### 3c. Documentation and operations

- [ ] **S** One consolidated setup guide with a table of every environment variable.
- [ ] **S** A deployment checklist: migrations, first administrator, removing demo data, rotating secrets, switching Paystack to live.
- [ ] **M** Short user guides for administrators, teachers, parents and students.

---

## 4. Information the school must provide (not code)

- [ ] Real text for every `[Placeholder]` on the website: welcome line, history, mission, vision, philosophy, values, leadership, curriculum, programmes, admission requirements and process.
- [ ] Phone number, email, WhatsApp number and office hours.
- [ ] How long applications and messages are kept (a placeholder in the privacy notice).
- [ ] Fee categories and amounts for each class and term, any discounts, and payment deadlines.
- [ ] Confirm the grading scale (the WAEC-style template is loaded only as a starting point) and the assessment columns (for example CA 1, CA 2 and Exam).
- [ ] Classes (and arms such as JSS 1A), subjects per class, term dates, and which teacher is form teacher of each class.
- [ ] Photos for the gallery, and a logo.
- [ ] A lawyer's review of the privacy notice and how the school complies with the Nigeria Data Protection Act 2023.

---

## 5. Testing and quality gaps

- [ ] **S** Save the browser walkthrough scripts into the repository. Attendance is done (`e2e/attendance.walkthrough.py`, 17 checks, with `server/tests/seed-attendance.ts`); the walkthroughs for the earlier features still need to be rewritten.
- [ ] **M** Set up an automated pipeline (CI) so the API suites and browser walkthroughs run on every change. The API suites currently need a freshly started server each, because of the sign-up rate limit.
- [ ] **M** Add frontend component tests (there are none).
- [ ] **S** Make the API suites independent of data left by earlier runs.

---

## 6. Known limitations (things that work, but not perfectly)

- Attendance figures on a **published** report card are live, not frozen. A late register correction changes them.
- The local file-storage mode loses files when the server redeploys. Production must use Supabase storage.
- Email status says "accepted by the email service", not "delivered", because Resend delivery notifications are not wired up.
- Paystack refunds and disputes are only flagged for an administrator. They do not change the books automatically.
- Uploaded pictures are served as uploaded, with no resizing.
- Dates for attendance and notifications assume Lagos time.
- The application is English only.

---

## Suggested order

1. ~~Finish attendance (section 1)~~ done.
2. Verify against the real services and deploy (3a), so surprises show up early. **Next, and needs your accounts.**
3. ~~Timetables and exam schedules, then promotion and session rollover~~ done.
4. Parent–teacher messaging, student import and profile editing.
5. Security hardening, documentation and accessibility (3b and 3c) before real pupils' data goes in.
6. Dashboards and the optional extras last.
