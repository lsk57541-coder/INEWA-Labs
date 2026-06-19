-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Youtuber partner applications. Stores OAuth tokens, so unlike most other
-- tables in this project this does NOT use a blanket "anyone can" policy —
-- only the applicant and admins can read/write it.

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  channel_id text unique not null,
  channel_name text not null,
  subscriber_count integer,
  categories text[] not null,
  region text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  youtube_access_token text,
  youtube_refresh_token text,
  created_at timestamptz not null default now()
);

alter table partners enable row level security;

create policy "select own partner application" on partners
  for select using (auth.uid() = user_id);

create policy "admin can read all partner applications" on partners
  for select using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "insert own partner application" on partners
  for insert with check (auth.uid() = user_id);

create policy "admin can update partner applications" on partners
  for update using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
