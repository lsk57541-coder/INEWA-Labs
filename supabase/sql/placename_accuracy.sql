-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Tracks how each video's displayed place name was resolved, so accuracy can
-- be measured by cross-referencing with location_reports (reason='wrong_address').

create table if not exists placename_resolutions (
  video_id text primary key,
  source text not null, -- 'explicit_description' | 'title_match' | 'address_match' | 'address_fallback' | 'correction'
  place_name text,
  updated_at timestamptz not null default now()
);

alter table placename_resolutions enable row level security;

create policy "anyone can read placename_resolutions" on placename_resolutions
  for select using (true);

create policy "anyone can upsert placename_resolutions" on placename_resolutions
  for insert with check (true);

create policy "anyone can update placename_resolutions" on placename_resolutions
  for update using (true);
