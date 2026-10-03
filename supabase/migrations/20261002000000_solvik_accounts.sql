-- Solvik accounts. Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Only the Solvik server reads or writes these tables, using the project's
-- secret key, which bypasses row-level security. RLS is switched on with no
-- policies, so the public anon key can read nothing here.

create table if not exists public.solvik_users (
  id uuid primary key,
  username text not null,
  username_lower text not null unique,
  password_hash text not null,
  salt text not null,
  preferences jsonb not null default '{}'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

-- token_hash is the SHA-256 of the session token; the token itself is never stored.
create table if not exists public.solvik_sessions (
  token_hash text primary key,
  user_id uuid not null references public.solvik_users (id) on delete cascade,
  created_at bigint not null,
  expires_at bigint not null
);

create index if not exists solvik_sessions_user_id_idx on public.solvik_sessions (user_id);

alter table public.solvik_users enable row level security;
alter table public.solvik_sessions enable row level security;

revoke all on public.solvik_users, public.solvik_sessions from anon, authenticated;
