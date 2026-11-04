create table academic_sessions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (name ~ '^\d{4}/\d{4}$'),
  start_date date not null,
  end_date   date not null check (end_date >= start_date),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index academic_sessions_one_current on academic_sessions (is_current) where is_current;

create table terms (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references academic_sessions(id) on delete cascade,
  term_number smallint not null check (term_number between 1 and 3),
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  is_current  boolean not null default false,
  unique (session_id, term_number)
);
create unique index terms_one_current on terms (is_current) where is_current;

create type school_stage as enum ('JSS', 'SSS');

create table classes (
  id    uuid primary key default gen_random_uuid(),
  stage school_stage not null,
  year  smallint not null check (year between 1 and 3),
  arm   text check (arm is null or arm ~ '^[A-Za-z0-9 ]{1,10}$')
);
create unique index classes_unique on classes (stage, year, coalesce(arm, ''));

create table subjects (
  id   uuid primary key default gen_random_uuid(),
  name citext not null unique,
  code text unique
);

create table class_subjects (
  class_id   uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete restrict,
  primary key (class_id, subject_id)
);

create table teacher_profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  staff_number text not null unique
);
create table student_profiles (
  user_id          uuid primary key references users(id) on delete cascade,
  admission_number text not null unique,
  date_of_birth    date
);
create table parent_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  address text
);

create table enrolments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete restrict,
  session_id uuid not null references academic_sessions(id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'withdrawn', 'graduated')),
  created_at timestamptz not null default now(),
  unique (student_id, session_id)
);
create index enrolments_class_session_idx on enrolments (class_id, session_id);

create table teaching_assignments (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references academic_sessions(id) on delete cascade,
  class_id   uuid not null,
  subject_id uuid not null,
  teacher_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, class_id, subject_id, teacher_id),
  foreign key (class_id, subject_id) references class_subjects(class_id, subject_id) on delete restrict
);
create index teaching_assignments_teacher_idx on teaching_assignments (teacher_id, session_id);

-- Guardian links. Only administrators change these (school verification).
create table parent_students (
  parent_id    uuid not null references users(id) on delete cascade,
  student_id   uuid not null references users(id) on delete cascade,
  relationship text not null check (relationship in ('mother', 'father', 'guardian', 'other')),
  is_primary   boolean not null default false,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on parent_students (student_id);

alter table academic_sessions  enable row level security;
alter table terms              enable row level security;
alter table classes            enable row level security;
alter table subjects           enable row level security;
alter table class_subjects     enable row level security;
alter table teacher_profiles   enable row level security;
alter table student_profiles   enable row level security;
alter table parent_profiles    enable row level security;
alter table enrolments         enable row level security;
alter table teaching_assignments enable row level security;
alter table parent_students    enable row level security;
