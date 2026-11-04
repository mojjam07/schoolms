create extension if not exists pgcrypto;
create extension if not exists citext;

create type user_role as enum ('admin', 'teacher', 'student', 'parent');
create type user_status as enum ('pending', 'active', 'suspended');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text,
  role          user_role not null,
  status        user_status not null default 'pending',
  first_name    text not null,
  last_name     text not null,
  phone         text,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index users_role_status_idx on users (role, status);

-- One-time tokens for account activation and password reset (only hashes are stored)
create table auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  purpose    text not null check (purpose in ('activation', 'password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_user_idx on auth_tokens (user_id, purpose);

-- Rotating refresh tokens; family_id lets us revoke a whole login chain on reuse
create table refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  family_id   uuid not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  replaced_by uuid references refresh_tokens(id),
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);
create index refresh_tokens_family_idx on refresh_tokens (family_id);

create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Supabase exposes the public schema through its own REST API using the anon key.
-- Enabling RLS with no policies blocks that route entirely. The Express backend
-- connects as the database owner role, which bypasses RLS, so it is unaffected.
alter table users          enable row level security;
alter table auth_tokens    enable row level security;
alter table refresh_tokens enable row level security;
alter table audit_logs     enable row level security;
alter table settings       enable row level security;
