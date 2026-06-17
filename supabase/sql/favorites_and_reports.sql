-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null,
  thumbnail text not null,
  channel text not null,
  lat double precision not null,
  lng double precision not null,
  place_name text,
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);

alter table favorites enable row level security;

create policy "select own favorites" on favorites
  for select using (auth.uid() = user_id);

create policy "insert own favorites" on favorites
  for insert with check (auth.uid() = user_id);

create policy "delete own favorites" on favorites
  for delete using (auth.uid() = user_id);

create table if not exists location_reports (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  lat double precision,
  lng double precision,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table location_reports enable row level security;

create policy "anyone can insert reports" on location_reports
  for insert with check (true);

create policy "anyone can read reports" on location_reports
  for select using (true);
