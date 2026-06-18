-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).

create table if not exists visited_places (
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

alter table visited_places enable row level security;

create policy "select own visited" on visited_places
  for select using (auth.uid() = user_id);

create policy "insert own visited" on visited_places
  for insert with check (auth.uid() = user_id);

create policy "delete own visited" on visited_places
  for delete using (auth.uid() = user_id);
