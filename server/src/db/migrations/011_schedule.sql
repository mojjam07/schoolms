-- Weekly timetable: one row is one lesson slot for a class in a session.
-- Teachers are not stored on the slot: they come from teaching_assignments for that class and subject,
-- so changing who teaches a subject never leaves the timetable out of step.
create table timetable_entries (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references academic_sessions(id) on delete cascade,
  class_id    uuid not null,
  subject_id  uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 5), -- 1 = Monday ... 5 = Friday
  start_time  time not null,
  end_time    time not null,
  room        text check (room is null or length(room) <= 40),
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  foreign key (class_id, subject_id) references class_subjects(class_id, subject_id) on delete restrict
);
create index timetable_class_idx on timetable_entries (session_id, class_id, day_of_week, start_time);

-- An examination period for one term (for example "First term examinations"). Hidden until published.
create table exam_schedules (
  id           uuid primary key default gen_random_uuid(),
  term_id      uuid not null references terms(id) on delete cascade,
  title        text not null check (length(trim(title)) between 2 and 120),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index exam_schedules_term_idx on exam_schedules (term_id);

-- One paper = one subject for one class on one date.
create table exam_papers (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references exam_schedules(id) on delete cascade,
  class_id     uuid not null,
  subject_id   uuid not null,
  exam_date    date not null,
  start_time   time not null,
  end_time     time not null,
  venue        text check (venue is null or length(venue) <= 80),
  instructions text check (instructions is null or length(instructions) <= 500),
  updated_at   timestamptz not null default now(),
  check (end_time > start_time),
  unique (schedule_id, class_id, subject_id),
  foreign key (class_id, subject_id) references class_subjects(class_id, subject_id) on delete restrict
);
create index exam_papers_class_date_idx on exam_papers (class_id, exam_date);

alter table timetable_entries enable row level security;
alter table exam_schedules    enable row level security;
alter table exam_papers       enable row level security;
