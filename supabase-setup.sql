-- Project showcase — database setup
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

-- Anyone visiting the site can read the projects.
drop policy if exists "projects are public" on public.projects;
create policy "projects are public"
  on public.projects for select
  to anon, authenticated
  using (true);

-- Only a signed-in user can add, edit or delete.
drop policy if exists "signed-in users can write" on public.projects;
create policy "signed-in users can write"
  on public.projects for all
  to authenticated
  using (true)
  with check (true);
