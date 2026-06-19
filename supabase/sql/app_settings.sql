-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Generic key/value settings table. Currently holds
-- 'min_placename_confidence', the cutoff admins use to control which
-- placeName sources are trustworthy enough to show in search results
-- (see PlaceNameSource / SOURCE_RANK in src/app/api/search/route.ts).

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('min_placename_confidence', 'address_match')
on conflict (key) do nothing;

alter table app_settings enable row level security;

create policy "anyone can read app_settings" on app_settings
  for select using (true);

create policy "anyone can upsert app_settings" on app_settings
  for insert with check (true);

create policy "anyone can update app_settings" on app_settings
  for update using (true);
