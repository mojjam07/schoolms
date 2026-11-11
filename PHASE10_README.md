# Phase 10: parent–teacher and parent–office messaging

## Apply
1. Copy the files in this zip over the project (same folder layout). Nothing existing is replaced.
2. Run `server/src/db/migrations/014_messaging.sql`.
3. Make the small edits in `APP_TS_TWO_LINES.txt` (server) and `WIRING_CLIENT.txt` (client).
4. Start a fresh API process and run: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase10.test.ts`

## Rules built in
- A parent can write to the **school office** about any linked child, and to a **teacher** only if that teacher teaches the child's class
  or is its form teacher in the **current session** (subject teachers via `teaching_assignments`, form teachers via `class_form_teachers`).
- A teacher can write only to parents of pupils in classes they teach. Students have no messaging.
- Teacher email addresses and phone numbers are never returned. Parents see names, subjects and "form teacher" only.
- Office threads are shared by all administrators. Administrators can **read** any conversation for safeguarding (each review is audit-logged)
  but can reply only to office threads.
- Outsiders get 404 on a thread, so its existence is not revealed. If a guardian link is removed, or a teacher stops teaching the child, replies are refused.
- Either side can report a message. An administrator can remove a message from view (text kept for review, restorable), and teachers or administrators can close and reopen a conversation.
- 4000 characters per message, 20 messages per person per hour, in-app notifications for each new message.
- The notification rows use `type = 'message'` and link to `/parent/messages/:id`, `/teacher/messages/:id` or `/admin/messages/:id`.

## Not done / assumptions
- **Not run.** I did not have the full repository, so none of this has been type-checked, built, or run against Postgres. Expect small fixes.
  `ui.tsx` was not in the files I received, so the pages assume `TextArea`, `SmallButton`, `Alert`, `Badge` (tones good/warn/bad) and `bg-brand-700`, as used in Phase 9 pages.
- The test sets up the form teacher with a direct SQL insert, and assumes `/academic/enrolments`, `/academic/teaching-assignments` and `/parent-links` behave as in `phase9.test.ts`.
- No email for messages (in-app only, as agreed for routine events), no attachments, no safeguarding keyword scanning, and no automatic retention rule yet
  (add it with the data-protection tooling in section 3b).
- The notification bell does not show an unread-messages badge; `GET /api/messages/unread-count` is ready for it.
