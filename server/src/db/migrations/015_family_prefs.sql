-- Parents ask the school to correct their guardian links; an administrator verifies and applies the change.
create table guardian_change_requests (
  id                    uuid primary key default gen_random_uuid(),
  parent_id             uuid not null references users(id) on delete cascade,
  kind                  text not null check (kind in ('relationship', 'remove', 'add')),
  student_id            uuid references users(id) on delete cascade,   -- required for relationship and remove
  proposed_relationship text check (proposed_relationship in ('mother', 'father', 'guardian', 'other')),
  child_name            text check (child_name is null or char_length(child_name) <= 120),        -- for add: the child's name as the parent gives it
  admission_number      text check (admission_number is null or char_length(admission_number) <= 40),
  note                  text not null check (char_length(note) between 1 and 1000),
  status                text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by            uuid references users(id) on delete set null,
  decided_at            timestamptz,
  decision_note         text check (decision_note is null or char_length(decision_note) <= 500),
  created_at            timestamptz not null default now(),
  check (kind = 'add' or student_id is not null),
  check (kind <> 'relationship' or proposed_relationship is not null)
);
create index guardian_requests_parent_idx on guardian_change_requests (parent_id, created_at desc);
create index guardian_requests_status_idx on guardian_change_requests (status, created_at);
-- A parent cannot stack up identical open requests about the same child.
create unique index guardian_requests_one_open on guardian_change_requests (parent_id, student_id, kind) where status = 'pending' and student_id is not null;

-- Only the choices a person has changed are stored. Anything missing means the default (on).
create table notification_preferences (
  user_id  uuid not null references users(id) on delete cascade,
  category text not null check (category in ('messages', 'fees', 'results', 'attendance', 'assignments', 'schedule', 'announcements')),
  in_app   boolean not null default true,
  email    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table guardian_change_requests enable row level security;
alter table notification_preferences enable row level security;
