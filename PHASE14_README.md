# Phase 14: results history (REMAINING-WORK section 2, "Results history: progress across terms, plus an annual or cumulative result")

## Apply
1. Copy the files over the project. Nothing existing is replaced and there is no migration.
2. Edit `server/src/app.ts` (`APP_TS_TWO_LINES.txt`) and `client/src/App.tsx` (`client/WIRING_CLIENT.txt`), and add the "progress" link to the two results pages.
3. Fresh API process: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase14.test.ts`

## What it does
- **Student: My progress** (`/student/results/history`) and **parent: Progress over time** (`/parent/results/history`, one tab per child).
- A line of the average for each published term, a table of every subject by term (percentage and grade), and a **yearly result** for each session.
- **Yearly result:** each subject is the average of its percentages over the published terms where every score was entered; the overall figure is the average of those.
  It is marked **Provisional** until all three terms are published.
- Only terms the school has **published for the pupil's class** appear. Each term is graded with the scale frozen at publication (the same rule as the report card),
  so later changes to the grading scale never alter history. A subject with a missing score shows "incomplete" and is left out of that term's average.
- `GET /api/results-history/me` (student) and `/children` (parent) are always scoped to the caller.

## Rules I had to choose (please confirm they match your report cards)
- Subject percentage = sum of the session's components scored / sum of their maximum scores, shown to one decimal place.
- A subject is "complete" only when every assessment component of the session has a score for that term.
- Term average = plain average of the complete subjects' percentages (the existing report card may weight or round differently, and I could not see that code).
  If your report card computes the average from total marks instead, tell me and I will match it.
- No cumulative position in class or year: ranking across terms needs the whole class's data and a school decision on ties and repeaters.

## Not done
- **Not run.** No full repository here, so nothing was type-checked or run; queries were checked by hand against migrations 001-013.
- Teachers and administrators cannot view a pupil's history yet (only the pupil and linked parents).
- No printable or PDF version of the yearly result (report cards still print from the browser; PDF is a separate item on your list).
