-- Find test and demo data before going live. Everything here only READS, except the last block, which is wrapped so it does nothing unless you change ROLLBACK to COMMIT.
-- Run against a COPY first (a restored backup), then against production once you trust what it lists.

-- 1. Accounts that look like test accounts (the automated tests create addresses at example.com).
select role, count(*) from users where email ilike '%@example.com' group by role order by role;
select id, email, role, created_at from users where email ilike '%@example.com' order by created_at desc limit 50;

-- 2. Sessions the tests created (they use years far in the future, 2100 and later).
select s.id, s.name, s.start_date, (select count(*) from enrolments e where e.session_id = s.id) as enrolments from academic_sessions s where s.start_date >= '2100-01-01' order by s.start_date;

-- 3. Anything that is NOT test data but is still a demo account: review by hand.
select email, role, created_at from users where email not ilike '%@example.com' order by created_at;

-- 4. The administrator accounts that exist. There should be only the people who really run the school.
select email, status, last_login_at from users where role = 'admin' order by created_at;

-- 5. Removal of test accounts. READ THE PREVIEW ABOVE FIRST. Deleting a user also removes what hangs off them (links, notifications, submissions).
-- Records that must be kept for the school (results, invoices) stop the delete, which is the safe outcome: the statement fails and nothing changes.
begin;
  delete from users where email ilike '%@example.com' and role <> 'admin';
  -- check the counts, then:
rollback;   -- change to COMMIT only when the preview was exactly what you expected
