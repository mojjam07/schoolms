create table assignments (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references users(id) on delete cascade,
  session_id         uuid not null references academic_sessions(id) on delete cascade,
  class_id           uuid not null references classes(id) on delete restrict,
  subject_id         uuid not null references subjects(id) on delete restrict,
  title              text not null,
  description        text not null default '',
  instructions       text not null default '',
  max_marks          numeric(6,2) not null check (max_marks > 0),
  publish_at         timestamptz,
  due_at             timestamptz not null,
  allow_resubmission boolean not null default false,
  status             text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index assignments_class_idx on assignments (class_id, session_id, status);
create index assignments_teacher_idx on assignments (teacher_id);

create table assignment_files (
  assignment_id uuid not null references assignments(id) on delete cascade,
  file_id       uuid not null references files(id) on delete cascade,
  primary key (assignment_id, file_id)
);
create index assignment_files_file_idx on assignment_files (file_id);

-- One row per attempt. Marks and feedback belong to the attempt, so earlier grades are never overwritten.
create table submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id    uuid not null references users(id) on delete cascade,
  attempt       integer not null default 1,
  text_response text not null default '',
  submitted_at  timestamptz not null default now(),
  is_late       boolean not null default false,
  status        text not null default 'submitted' check (status in ('submitted', 'graded', 'returned')),
  marks         numeric(6,2) check (marks >= 0),
  feedback      text,
  graded_by     uuid references users(id) on delete set null,
  graded_at     timestamptz,
  returned_at   timestamptz,
  unique (assignment_id, student_id, attempt)
);
create index submissions_student_idx on submissions (student_id);

create table submission_files (
  submission_id uuid not null references submissions(id) on delete cascade,
  file_id       uuid not null references files(id) on delete cascade,
  primary key (submission_id, file_id)
);
create index submission_files_file_idx on submission_files (file_id);

alter table assignments      enable row level security;
alter table assignment_files enable row level security;
alter table submissions      enable row level security;
alter table submission_files enable row level security;
