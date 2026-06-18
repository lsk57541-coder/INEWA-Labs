-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Caches raw YouTube search.list results (the expensive 100-quota-unit call)
-- per (query/channel + rounded location) so repeated searches — e.g. a user
-- just changing the radius slider — don't re-hit the YouTube API.

create table if not exists search_cache (
  key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table search_cache enable row level security;

create policy "anyone can read search_cache" on search_cache
  for select using (true);

create policy "anyone can upsert search_cache" on search_cache
  for insert with check (true);

create policy "anyone can update search_cache" on search_cache
  for update using (true);
