# Operations: backups, recovery, monitoring, routine jobs

## 1. What can be lost, and what protects it
| What | Where it lives | How it is protected |
|---|---|---|
| All records (people, results, fees, attendance, messages, audit log) | Supabase Postgres | Supabase backups **plus** your own dumps with `tools/backup.sh` |
| Uploaded files (lesson files, submissions, gallery) | Supabase Storage bucket | **Not** covered by database backups. Copy the bucket regularly (see 3) |
| Code | Git repository | The repository host. Keep a second copy |
| Secrets | Render and Vercel settings | A password manager entry for each. Without them a rebuilt service cannot start |

## 2. Database backups
1. In Supabase, open the project's backup settings and note what **your plan** gives you (daily backups, how many days are kept, whether point-in-time recovery is available). This differs by plan and changes over time, so read it today rather than assume. If the plan has no backups, upgrade before real data goes in.
2. Add your own copy: run `tools/backup.sh` on a schedule from a computer or a CI job (GitHub Actions can do this nightly) and store the result somewhere that is **not** the same Supabase project, for example a different cloud bucket. Encrypt it, because it contains children's records.
3. Take an extra backup by hand before: results publication, new-session promotion, any bulk import, and any migration.

## 3. File backups
Once a week, copy the storage bucket to another location (Supabase's S3-compatible access with a tool such as `rclone`, or download from the dashboard for a small school). Record the date of the last copy.

## 4. Recovery drill (do this before launch, then every term)
Practice on a **new, empty** Supabase project, never on production:
1. Create the empty project and note its direct connection string.
2. `pg_restore --no-owner --no-privileges --clean --if-exists --dbname "<new direct url>" backups/<file>.dump`
3. Point a copy of the API at the new database and sign in as an administrator.
4. Check: the number of students, the last payment recorded, the last published result, and the audit log's newest entry all match what you expect.
5. Write down how long it took and anything that went wrong. That time is your real recovery time.

## 5. If something goes wrong
- **Wrong data was deleted or changed:** stop changes if you can, take a fresh backup of the current state, then restore the last good backup into a **new** project and copy back only the missing rows. Do not restore over production unless you have decided to lose everything since the backup.
- **A payment looks wrong:** payments are never edited, only reversed. Check the invoice's payment list and the audit log. For Paystack, compare with the Paystack dashboard.
- **A secret may have leaked:** rotate it at once (database password, token secrets, Paystack secret key, Resend key, Supabase service key), redeploy, then sign everyone out by rotating the token secret.
- **Personal data may have been exposed:** the Nigeria Data Protection Act expects the regulator and affected people to be told within a short time. Record what happened and ask the school's lawyer the same day.

## 6. Monitoring (set up before launch)
- **Errors:** add an error tracker (Sentry has a free tier) to the API and the website, so a failing page is reported to you, not discovered by a parent.
- **Uptime:** a free uptime monitor (UptimeRobot, Better Stack) pinging the website and one public API route every 5 minutes, alerting your phone.
- **Render:** turn on deploy and failure notifications. **Supabase:** turn on the usage and disk alerts.
- **Email:** watch the Resend dashboard for bounces and complaints after the first fee run.

## 7. Routine jobs
| Job | How often | Notes |
|---|---|---|
| Clean-up of old records | daily (cron) | Admin > Data and privacy shows what is due. Periods come from the `RETENTION_*` variables |
| Instalment reminders | daily (cron) | In-app, once per instalment and stage |
| Backup (`tools/backup.sh`) | nightly | Verify the newest file opens: the script does this |
| File copy | weekly | |
| Dependency check | monthly | `npm audit` in `server` and `client`, then update and retest |
| Recovery drill | each term | Section 4 |
| Review administrator accounts | each term | Remove anyone who has left |

## 8. Before each school term
- Take a backup. Run the new-session promotion in a quiet hour. Check the grading columns and fees for the new session, which are set up by hand.
- After promotion, spot-check three classes: pupils, form teacher, timetable, and one invoice.
