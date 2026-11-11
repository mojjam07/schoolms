# Phase 11: data-protection tooling (REMAINING-WORK 3b, "Data-protection tooling")

## Apply
1. Copy the files in this zip over the project. Nothing existing is replaced and there is no migration.
2. Make the small edits in `APP_TS_TWO_LINES.txt` (server) and `client/WIRING_CLIENT.txt` (client).
3. Fresh API process, then: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase11.test.ts`
   (the first test line uses `/notifications/read-all`; if your route is named differently, change or delete that one line)
4. Schedule the cleanup: on Render add a Cron Job running `npx tsx src/scripts/retention.ts --apply` once a day.
   Run it without `--apply` first to see what it would remove.

## What it does
- **Admin > Data and privacy** shows each kind of old record, the rule, and how many are due. One button removes them. Every run is audited.
- **Removed (when old enough):** used or expired activation and reset links, old sign-in sessions, read notifications, any notification after a year,
  archived website enquiries, declined or withdrawn applications that never became a student, and (only if you switch it on) closed conversations.
- **Never removed:** the audit log, results, fees, attendance, submissions, any applicant who became a student, new or read enquiries, reported conversations.
- **Export:** enter an account email, download one JSON file: account, profile, guardian links, classes, scores, attendance, submissions, invoices,
  notifications, messages they sent, uploaded file details and actions they took. No passwords or tokens, and nothing about other people's messages. Each export is audited.

## Settings (environment variables, all optional)
| Variable | Default | Meaning |
|---|---|---|
| RETENTION_TOKEN_DAYS | 30 | days after a link or session expires or is revoked |
| RETENTION_READ_NOTIFICATION_DAYS | 90 | days after a notification was read |
| RETENTION_ANY_NOTIFICATION_DAYS | 365 | days after any notification was created |
| RETENTION_CONTACT_DAYS | 365 | archived website enquiries |
| RETENTION_APPLICATION_DAYS | 365 | declined or withdrawn applications |
| RETENTION_ORPHAN_FILE_DAYS | 7 | unattached uploads |
| RETENTION_CLOSED_MESSAGE_DAYS | off | closed parent/staff conversations; set only once the school decides |

These defaults are my choice, not the school's. Section 4 of REMAINING-WORK still needs the school to say how long applications and messages are kept,
and the privacy notice should state the same periods.

## Not done, and why
- **File deletion is not connected.** I could not see your storage code, so `retention.storage.ts` has one empty slot. Until you fill it,
  unattached files are counted but never deleted, and the screen says so. Fill it with your delete-by-storage-key call.
- **Not run.** No full repository here, so nothing was type-checked or run. The queries were checked by hand against migrations 001–014.
- **No deletion or anonymising of a person on request.** Students with results, invoices or attendance cannot simply be deleted (several tables restrict it),
  and whether to erase, anonymise or keep them is a decision for the school and its lawyer under the Nigeria Data Protection Act. Export is built; erasure waits for that decision.
- Fee payments and Paystack records are not in the export (I did not have their column layout in view). Add them if the school wants them included.
