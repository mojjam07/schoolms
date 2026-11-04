create table files (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  purpose       text not null check (purpose in ('resource', 'assignment', 'submission')),
  original_name text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  storage_key   text not null unique,
  created_at    timestamptz not null default now()
);
create index files_owner_idx on files (owner_id);

create table lesson_notes (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references users(id) on delete cascade,
  session_id   uuid not null references academic_sessions(id) on delete cascade,
  class_id     uuid not null references classes(id) on delete restrict,
  subject_id   uuid not null references subjects(id) on delete restrict,
  topic        text,
  title        text not null,
  body         text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index lesson_notes_class_idx on lesson_notes (class_id, session_id, status);
create index lesson_notes_teacher_idx on lesson_notes (teacher_id);

create table lesson_note_files (
  note_id uuid not null references lesson_notes(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  primary key (note_id, file_id)
);
create index lesson_note_files_file_idx on lesson_note_files (file_id);

create table video_lessons (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references users(id) on delete cascade,
  session_id   uuid not null references academic_sessions(id) on delete cascade,
  class_id     uuid not null references classes(id) on delete restrict,
  subject_id   uuid not null references subjects(id) on delete restrict,
  topic        text,
  title        text not null,
  description  text not null default '',
  instructions text not null default '',
  youtube_id   text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index video_lessons_class_idx on video_lessons (class_id, session_id, status);
create index video_lessons_teacher_idx on video_lessons (teacher_id);

alter table files             enable row level security;
alter table lesson_notes      enable row level security;
alter table lesson_note_files enable row level security;
alter table video_lessons     enable row level security;
