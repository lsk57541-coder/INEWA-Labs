-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).

alter table location_reports add column if not exists reason text;
alter table location_reports add column if not exists suggested_address text;

-- Holds a confirmed corrected location for a video. When a user reports
-- "주소가 정확하지 않아요" with a suggested address that Kakao successfully
-- geocodes, we apply it here immediately and search results use this
-- location instead of the original geotag/AI-derived one.
create table if not exists location_corrections (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  lat double precision not null,
  lng double precision not null,
  address text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table location_corrections enable row level security;

create policy "anyone can read corrections" on location_corrections
  for select using (true);

create policy "authenticated can insert corrections" on location_corrections
  for insert with check (auth.uid() is not null);

create policy "authenticated can update corrections" on location_corrections
  for update using (auth.uid() is not null);
