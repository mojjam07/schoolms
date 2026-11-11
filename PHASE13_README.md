# Phase 13: student and parent home pages (REMAINING-WORK section 2, Dashboards: "Student and parent dashboards as one overview page")

## Apply
1. Copy the files over the project. `server/src/modules/dashboard/dashboard.routes.ts` REPLACES the Phase 12 copy (it keeps admin and teacher and adds student and parent).
   This phase needs Phase 12's `dashboard.service.ts` to be present (the routes file still imports it).
2. Edit `client/src/App.tsx` (`client/WIRING_CLIENT.txt`). No migration, and no new `app.ts` line if Phase 12 is in (`APP_TS_TWO_LINES.txt`).
3. Fresh API process: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase13.test.ts`

## What each page shows
One shared overview per pupil (`components/ChildOverview.tsx`):
- today's lessons with room and teacher (Lagos weekday; none at weekends)
- the next five published examinations
- assignments due soon (not handed in first), and a count of past-deadline work not handed in
- the three most recent marks
- attendance for the current term, as a percentage with present, late and absent days
- a link to the latest published report card
- **parents only:** this term's fees (total, paid, outstanding) with a link to view and pay

The **student** home shows one pupil (themselves) plus a link when notifications are unread.
The **parent** home shows a tab per child (only when there is more than one), unread notifications and unread messages (Phase 10).
`GET /api/dashboard/student` and `/parent` are always scoped to the signed-in user: a student sees only themselves, a parent only children linked to them.

## Not done
- **Not run.** No full repository here, so nothing was type-checked or run; queries were checked by hand against migrations 001-013.
- These pages replace what your current `StudentHome` and `ParentHome` show. I could not see those files; if they showed something this does not, tell me and I will add it.
- Students do not see fees (the spec gives fees to parents; say if you want it for students).
- "Recent marks" covers assignments only, because that is the only per-piece marking in the system (term scores appear on the report card).
- Assignments due uses the same visibility rule as the assignment pages (published, publish time reached, not yet due); I could not see that code, so check a scheduled assignment shows only once it is visible.
