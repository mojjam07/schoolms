# Phase 16: quizzes and tests (REMAINING-WORK section 2, "Quizzes and tests")

## Apply
1. Copy the files over the project. Nothing existing is replaced.
2. Run the migration `server/src/db/migrations/016_quizzes.sql`.
3. Edit `server/src/app.ts` (`APP_TS_TWO_LINES.txt`) and `client/src/App.tsx` (`client/WIRING_CLIENT.txt`).
4. Fresh API process: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase16.test.ts`

## How it works
**Teacher:** pick a class and subject they teach, write questions (multiple choice, one correct answer, 2 to 6 options, marks per question, true/false is just two options),
set when it opens and closes, an optional time limit, 1 to 5 attempts, and whether students see the correct answers after submitting. Save as a draft, check it, then **publish**
(the enrolled students are notified). A published quiz cannot be edited, only closed; closing submits anyone still taking it. The results page shows each student's best score.

**Student:** Quizzes list shows open, in progress, finished and closed quizzes. Start or continue; answers save as they are chosen; a countdown runs against the server's clock;
when time is up the attempt is submitted automatically with what was saved. The score appears at once; correct answers appear only if the teacher allowed it.

**Parent:** each child's quizzes with the best score.

## Rules enforced on the server (not just the screen)
- The correct answers are never sent to a student while an attempt is in progress, and options are shuffled differently for each attempt.
- The deadline is the closing time or the time limit from the moment the attempt began, whichever is first. Late saves are refused and the attempt is submitted.
- A student can only start a quiz for their own class and only while it is published and inside its window. One attempt can be open at a time; starting again resumes it.
- Attempts are capped; the best score counts. A student can only ever open their own attempts, and a teacher only their own quizzes.
- Every create, edit, publish, close and delete is in the audit log.

## Not done
- **Not run.** No full repository here, so nothing was type-checked or run; queries were checked by hand against migrations 001-014.
- Question types other than single-answer multiple choice (multiple answers, short answer, essay) are not built; short and essay answers need hand marking, which is a separate piece.
- Quiz scores are **not** added to the report-card assessment components automatically. The teacher still enters term scores as before.
  (Linking a quiz to a component, such as "CA 1", needs a decision from the school on how scores are scaled.)
- No question bank or reuse of questions between quizzes, and no image in a question.
- Notifications use the type `assignment_quiz_published`, so they fall under the "Assignments" preference from Phase 15.
