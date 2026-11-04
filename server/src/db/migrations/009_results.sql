-- The school's grading scale. Each band applies from its minimum percentage up to the next band's minimum.
create table grade_bands (
  id          uuid primary key default gen_random_uuid(),
  min_percent numeric(5,2) not null unique check (min_percent between 0 and 100),
  grade       text not null check (length(trim(grade)) > 0),
  remark      text not null default ''
);

-- The columns of a mark sheet for a session, for example two tests and an exam. Set by the administrator.
create table assessment_components (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references academic_sessions(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('ca', 'exam')),
  max_score  numeric(6,2) not null check (max_score > 0),
  sort_order integer not null default 0,
  unique (session_id, name)
);

create table scores (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references users(id) on delete cascade,
  subject_id   uuid not null references subjects(id) on delete restrict,
  term_id      uuid not null references terms(id) on delete cascade,
  component_id uuid not null references assessment_components(id) on delete restrict,
  score        numeric(6,2) not null check (score >= 0),
  entered_by   uuid references users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (student_id, subject_id, term_id, component_id)
);
create index scores_term_subject_idx on scores (term_id, subject_id);

-- Publishing a class's results for a term makes them visible to students and parents.
-- The grading scale in force at that moment is kept, so later edits to the scale never change published report cards.
create table result_publications (
  term_id      uuid not null references terms(id) on delete cascade,
  class_id     uuid not null references classes(id) on delete cascade,
  published_at timestamptz not null default now(),
  published_by uuid references users(id) on delete set null,
  grading      jsonb not null,
  primary key (term_id, class_id)
);

create table report_remarks (
  student_id uuid not null references users(id) on delete cascade,
  term_id    uuid not null references terms(id) on delete cascade,
  remark     text not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (student_id, term_id)
);

alter table grade_bands            enable row level security;
alter table assessment_components  enable row level security;
alter table scores                 enable row level security;
alter table result_publications    enable row level security;
alter table report_remarks         enable row level security;
