-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Partner-managed places for the partner dashboard. Separate from the
-- existing `locations`/`videos` tables (admin-curated, used by the public
-- search) — these are self-service, owned by a single partner.

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete cascade,
  name text not null,
  address text,
  category text,
  video_url text,
  latitude float,
  longitude float,
  status text not null default 'reviewing' check (status in ('active', 'reviewing', 'hidden')),
  click_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists place_clicks (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references places(id) on delete cascade,
  ip_hash text,
  clicked_at timestamptz not null default now()
);

alter table places enable row level security;
alter table place_clicks enable row level security;

create policy "partner manages own places" on places
  for all using (
    exists (select 1 from partners where partners.id = places.partner_id and partners.user_id = auth.uid())
  );

create policy "admin can read all places" on places
  for select using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Click tracking isn't wired into the public map yet, but the schema is
-- ready for when it is — inserts are open since viewers clicking a place
-- aren't authenticated, reads are limited to the owning partner.
create policy "anyone can record a click" on place_clicks
  for insert with check (true);

create policy "partner reads own place clicks" on place_clicks
  for select using (
    exists (
      select 1 from places
      join partners on partners.id = places.partner_id
      where places.id = place_clicks.place_id and partners.user_id = auth.uid()
    )
  );
