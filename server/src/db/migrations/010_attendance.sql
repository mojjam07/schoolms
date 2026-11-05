-- One form teacher per class per session. They take the daily register for that class.
create table class_form_teachers (
  class_id   uuid not null references classes(id) on delete cascade,
  session_id uuid not null references academic_sessions(id) on delete cascade,
  teacher_id uuid not null references users(id) on delete cascade,
  primary key (class_id, session_id)
);

-- A register is one class on one day the school was open. "Times school opened" is the number of registers.
create table attendance_registers (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id) on delete cascade,
  term_id    uuid not null references terms(id) on delete cascade,
  date       date not null,
  taken_by   uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, date)
);
create index attendance_registers_term_idx on attendance_registers (term_id, class_id);

create table attendance_records (
  register_id uuid not null references attendance_registers(id) on delete cascade,
  student_id  uuid not null references users(id) on delete cascade,
  status      text not null check (status in ('present', 'late', 'absent')),
  primary key (register_id, student_id)
);
create index attendance_records_student_idx on attendance_records (student_id);

-- Parents explain absences; the school accepts or declines. Parents can never change the register itself.
create table absence_explanations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references users(id) on delete cascade,
  date         date not null,
  reason       text not null check (length(trim(reason)) > 0),
  submitted_by uuid not null references users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  reviewed_by  uuid references users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, date)
);
create index absence_explanations_status_idx on absence_explanations (status, created_at desc);

alter table class_form_teachers  enable row level security;
alter table attendance_registers enable row level security;
alter table attendance_records   enable row level security;
alter table absence_explanations enable row level security;
