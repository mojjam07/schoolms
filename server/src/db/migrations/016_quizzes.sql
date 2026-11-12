-- Auto-marked quizzes (single-answer multiple choice and true/false), taken online by students within a time window.
create table quizzes (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references users(id) on delete cascade,
  session_id       uuid not null references academic_sessions(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete restrict,
  subject_id       uuid not null references subjects(id) on delete restrict,
  title            text not null check (char_length(title) between 1 and 150),
  instructions     text not null default '' check (char_length(instructions) <= 2000),
  opens_at         timestamptz,
  closes_at        timestamptz not null,
  duration_minutes int check (duration_minutes between 1 and 300),          -- null = no time limit inside the window
  max_attempts     int not null default 1 check (max_attempts between 1 and 5),
  show_answers     boolean not null default false,                           -- reveal correct answers after a student submits
  status           text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index quizzes_class_idx on quizzes (class_id, session_id, status);
create index quizzes_teacher_idx on quizzes (teacher_id);

create table quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references quizzes(id) on delete cascade,
  position int not null,
  body     text not null check (char_length(body) between 1 and 1000),
  marks    numeric(5,2) not null default 1 check (marks > 0 and marks <= 100),
  unique (quiz_id, position)
);
create table quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  position    int not null,
  body        text not null check (char_length(body) between 1 and 500),
  is_correct  boolean not null default false,
  unique (question_id, position)
);
-- Exactly one correct option per question is checked when a quiz is published; this stops two being stored by accident.
create unique index quiz_one_correct_idx on quiz_options (question_id) where is_correct;

create table quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid not null references quizzes(id) on delete cascade,
  student_id     uuid not null references users(id) on delete cascade,
  attempt_no     int not null,
  status         text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at     timestamptz not null default now(),
  deadline_at    timestamptz not null,
  submitted_at   timestamptz,
  auto_submitted boolean not null default false,
  score          numeric(6,2),
  max_score      numeric(6,2),
  unique (quiz_id, student_id, attempt_no)
);
create unique index quiz_attempts_one_open on quiz_attempts (quiz_id, student_id) where status = 'in_progress';
create index quiz_attempts_student_idx on quiz_attempts (student_id, quiz_id);

create table quiz_answers (
  attempt_id  uuid not null references quiz_attempts(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete cascade,
  option_id   uuid references quiz_options(id) on delete set null,
  saved_at    timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

alter table quizzes        enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_options   enable row level security;
alter table quiz_attempts  enable row level security;
alter table quiz_answers   enable row level security;
