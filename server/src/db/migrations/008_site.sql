-- Public images (gallery, news pictures) are stored like other uploads, with their own purpose.
alter table files drop constraint files_purpose_check;
alter table files add constraint files_purpose_check check (purpose in ('resource', 'assignment', 'submission', 'public'));

create table site_posts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('news', 'announcement')),
  title        text not null,
  slug         text not null unique,
  summary      text not null default '',
  body         text not null default '',
  image_id     uuid references files(id) on delete set null,
  image_alt    text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'published')),
  pinned       boolean not null default false,
  expires_at   timestamptz,
  published_at timestamptz,
  author_id    uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index site_posts_public_idx on site_posts (status, kind, published_at desc);

create table site_events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  location     text not null default '',
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index site_events_public_idx on site_events (status, starts_at);

-- Facilities are categories the school fills in itself; nothing is claimed until an administrator adds it.
create table facilities (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  name        text not null,
  description text not null default '',
  sort_order  integer not null default 0,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table gallery_images (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete set null,
  file_id     uuid not null references files(id) on delete cascade,
  caption     text not null default '',
  alt_text    text not null check (length(trim(alt_text)) > 0),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index gallery_images_file_idx on gallery_images (file_id);

create sequence application_number_seq;
create table admission_applications (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default ('KOK-APP-' || lpad(nextval('application_number_seq')::text, 6, '0')),
  first_name      text not null,
  last_name       text not null,
  date_of_birth   date not null,
  class_stage     school_stage not null,
  class_year      smallint not null check (class_year between 1 and 3),
  previous_school text,
  guardian_name   text not null,
  guardian_phone  text not null,
  guardian_email  citext not null,
  address         text,
  message         text,
  status          text not null default 'received' check (status in ('received', 'under_review', 'interview', 'offered', 'declined', 'withdrawn')),
  public_note     text,
  admin_note      text,
  consent_at      timestamptz not null,
  email_status    text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index admission_applications_status_idx on admission_applications (status, created_at desc);

create table contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      citext not null,
  phone      text,
  subject    text not null,
  message    text not null,
  status     text not null default 'new' check (status in ('new', 'read', 'archived')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table site_posts            enable row level security;
alter table site_events           enable row level security;
alter table facilities            enable row level security;
alter table gallery_images        enable row level security;
alter table admission_applications enable row level security;
alter table contact_messages      enable row level security;
