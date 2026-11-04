create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text not null default '',
  link         text,
  entity_type  text,
  entity_id    uuid,
  -- Stops the same event notifying the same person twice (for example an assignment closed and reopened).
  dedupe_key   text,
  -- A scheduled assignment's notice only appears once it is visible to students.
  available_at timestamptz not null default now(),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create unique index notifications_dedupe_idx on notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on notifications (user_id, available_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;
create index notifications_entity_idx on notifications (entity_type, entity_id);

alter table notifications enable row level security;
