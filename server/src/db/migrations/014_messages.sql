create table message_threads (
  id                 uuid primary key default gen_random_uuid(),
  parent_id          uuid not null references users(id) on delete cascade,
  staff_id           uuid references users(id) on delete set null,
  student_id         uuid not null references users(id) on delete cascade,
  subject            text not null,
  status             text not null default 'open' check (status in ('open', 'closed')),
  started_by         uuid not null references users(id) on delete set null,
  last_sender_id     uuid references users(id) on delete set null,
  parent_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  last_message_at    timestamptz not null default now(),
  reported_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index message_threads_parent_idx on message_threads (parent_id, last_message_at desc);
create index message_threads_staff_idx on message_threads (staff_id, last_message_at desc);
create index message_threads_student_idx on message_threads (student_id, last_message_at desc);
create index message_threads_status_idx on message_threads (status, last_message_at desc);

create table messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references message_threads(id) on delete cascade,
  sender_id    uuid not null references users(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now(),
  hidden_at    timestamptz,
  hidden_by    uuid references users(id) on delete set null,
  hidden_reason text,
  reported_at  timestamptz,
  reported_by  uuid references users(id) on delete set null,
  report_reason text
);

create index messages_thread_idx on messages (thread_id, created_at desc);
create index messages_sender_idx on messages (sender_id, created_at desc);
create index messages_reported_idx on messages (reported_at, created_at desc) where reported_at is not null;

alter table message_threads enable row level security;
alter table messages enable row level security;
