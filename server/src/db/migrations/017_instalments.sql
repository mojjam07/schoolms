-- Instalment plans. A plan is just a schedule of due dates and amounts for one invoice; payments are still recorded
-- against the invoice as before and are matched to the instalments oldest first, so nothing here can change what has been paid.
create table invoice_instalments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references invoices(id) on delete cascade,
  position            int not null check (position between 1 and 6),
  due_date            date not null,
  amount_kobo         bigint not null check (amount_kobo > 0),
  reminded_soon_at    timestamptz,
  reminded_overdue_at timestamptz,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (invoice_id, position)
);
create index invoice_instalments_due_idx on invoice_instalments (due_date);
alter table invoice_instalments enable row level security;
