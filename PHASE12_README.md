# Phase 12: administrator overview and teacher home (REMAINING-WORK section 2, Dashboards)

## Apply
1. Copy the files over the project. Nothing existing is replaced, except that `client/src/lib/api.ts` is the fixed copy (see `API_TS_EDITS.txt`).
2. Edit `server/src/app.ts` (`APP_TS_TWO_LINES.txt`) and `client/src/App.tsx` (`client/WIRING_CLIENT.txt`). No migration.
3. Fresh API process: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase12.test.ts`

## Administrator overview (`GET /api/dashboard/admin`)
Students, teachers and parents; students by class for the current session; open assignments and submissions waiting to be marked;
recent admission applications; tuition billed, collected and outstanding for the current term (reversed payments are not counted as collected);
recent announcements; the last eight administrator actions with a link to the audit log; and a "needs attention" box
(applications to review, new website enquiries, reported conversations from Phase 10).

## Teacher home (`GET /api/dashboard/teacher`)
Classes taught, work waiting to be marked (oldest deadline first), upcoming deadlines with "n of N handed in",
the teacher's classes and subjects, announcements, and unread messages (Phase 10). Each teacher sees only their own assignments.

## Not done
- **Not run.** No full repository here, so nothing was type-checked or run; queries were checked by hand against migrations 001-013 (and 014 for messages).
  Counts that depend on the Phase 10 messages table fall back quietly if that migration is not applied.
- This replaces the content of your current admin `Overview` and teacher `Home` pages. I could not see them, so if they showed something this does not, tell me and I will add it.
- The student and parent dashboards (one overview page each) are still to do. "Recent announcements" shows published website announcements, because the project has no separate in-school announcements feature.
- Fee figures are for the **current term** only. A per-class breakdown and charts were left out to keep the page quick to load.
