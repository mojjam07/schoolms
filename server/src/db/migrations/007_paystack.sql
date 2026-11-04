-- One row per attempt to pay through Paystack. The row is created before the parent leaves for Paystack's page,
-- so every payment that comes back can be matched to an invoice, a payer and an amount we expected.
create table paystack_transactions (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete restrict,
  payer_id          uuid not null references users(id) on delete restrict,
  reference         text not null unique,
  amount_kobo       bigint not null check (amount_kobo > 0),
  status            text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  authorization_url text,
  access_code       text,
  gateway_response  text,
  channel           text,
  -- Set once the payment has been counted on the invoice. A second attempt to count it is impossible.
  payment_id        uuid unique references payments(id) on delete set null,
  -- Anything an administrator should look at: amount mismatch, overpayment, dispute, refund.
  review_note       text,
  paid_at           timestamptz,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index paystack_transactions_invoice_idx on paystack_transactions (invoice_id);
create index paystack_transactions_status_idx on paystack_transactions (status, created_at desc);

-- Every webhook delivery, with only non-sensitive fields. No card details are ever kept.
create table paystack_events (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  reference   text,
  summary     jsonb not null default '{}'::jsonb,
  duplicate   boolean not null default false,
  result      text,
  received_at timestamptz not null default now()
);
create index paystack_events_reference_idx on paystack_events (reference);

-- Belt and braces: even a bug in the code cannot count the same Paystack payment twice.
create unique index payments_paystack_reference_idx on payments (reference) where method = 'paystack';

alter table paystack_transactions enable row level security;
alter table paystack_events       enable row level security;
