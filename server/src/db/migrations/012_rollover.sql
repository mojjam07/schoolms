-- One row per completed promotion from one session to the next. The unique pair stops it being run twice.
create table session_rollovers (
  id              uuid primary key default gen_random_uuid(),
  from_session_id uuid not null references academic_sessions(id) on delete cascade,
  to_session_id   uuid not null references academic_sessions(id) on delete cascade,
  executed_by     uuid references users(id) on delete set null,
  summary         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (from_session_id, to_session_id),
  check (from_session_id <> to_session_id)
);
alter table session_rollovers enable row level security;
