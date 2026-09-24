-- Project showcase — database setup (no sign-in required)
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- Safe to run more than once.

create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text not null default '',
  link             text not null default '',
  image            text not null default '',
  open_in_new_tab  boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Row Level Security: nothing is readable or writable until a policy allows it.
alter table public.projects enable row level security;

-- Drop any older policies from a previous setup.
drop policy if exists "projects are public" on public.projects;
drop policy if exists "signed-in users can write" on public.projects;
drop policy if exists "anyone can read" on public.projects;
drop policy if exists "anyone can write" on public.projects;

-- Anyone (no sign-in) can read AND write. Simplest setup, no auth needed.
create policy "anyone can read"
  on public.projects for select
  to anon, authenticated
  using (true);

create policy "anyone can write"
  on public.projects for all
  to anon, authenticated
  using (true)
  with check (true);
