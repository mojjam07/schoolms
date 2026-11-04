-- All money is stored as whole kobo (1 naira = 100 kobo) so there is never any rounding drift.
create sequence invoice_number_seq;
create sequence receipt_number_seq;

create table fee_categories (
  id          uuid primary key default gen_random_uuid(),
  name        citext not null unique,
  description text not null default '',
  active      boolean not null default true
);

-- The amount each class pays for each category in each term. Real amounts are entered by the administrator.
create table fee_schedule_items (
  id          uuid primary key default gen_random_uuid(),
  term_id     uuid not null references terms(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  category_id uuid not null references fee_categories(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  unique (term_id, class_id, category_id)
);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  student_id    uuid not null references users(id) on delete restrict,
  term_id       uuid not null references terms(id) on delete restrict,
  class_id      uuid not null references classes(id) on delete restrict,
  due_date      date,
  status        text not null default 'open' check (status in ('open', 'cancelled')),
  cancel_reason text,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (student_id, term_id)
);
create index invoices_term_class_idx on invoices (term_id, class_id);

-- An invoice's total is the sum of its lines. Discounts are negative lines, each with a reason and the person who gave it.
create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  kind        text not null check (kind in ('fee', 'charge', 'discount')),
  category_id uuid references fee_categories(id) on delete set null,
  description text not null,
  amount_kobo bigint not null,
  reason      text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((kind in ('fee', 'charge') and amount_kobo > 0) or (kind = 'discount' and amount_kobo < 0))
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- Payments are never edited or deleted. A mistake is corrected by reversing the payment, which keeps the record.
create table payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references invoices(id) on delete restrict,
  receipt_number text not null unique default ('RCT-' || lpad(nextval('receipt_number_seq')::text, 6, '0')),
  amount_kobo    bigint not null check (amount_kobo > 0),
  method         text not null check (method in ('cash', 'bank_transfer', 'pos', 'paystack', 'other')),
  reference      text,
  note           text,
  paid_at        timestamptz not null default now(),
  recorded_by    uuid references users(id) on delete set null,
  reversed_at    timestamptz,
  reversed_by    uuid references users(id) on delete set null,
  reverse_reason text,
  created_at     timestamptz not null default now()
);
create index payments_invoice_idx on payments (invoice_id);

-- What actually happened to an email or SMS. "accepted" means the provider took it, which is not the same as delivered.
create table notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel         text not null check (channel in ('email', 'sms')),
  status          text not null check (status in ('accepted', 'failed', 'not_sent')),
  detail          text,
  created_at      timestamptz not null default now()
);
create index notification_deliveries_notification_idx on notification_deliveries (notification_id);

alter table fee_categories           enable row level security;
alter table fee_schedule_items       enable row level security;
alter table invoices                 enable row level security;
alter table invoice_lines            enable row level security;
alter table payments                 enable row level security;
alter table notification_deliveries  enable row level security;
