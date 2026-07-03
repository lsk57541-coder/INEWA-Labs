alter table videos   add column if not exists stats_updated_at timestamptz;
alter table places   add column if not exists stats_updated_at timestamptz;
alter table partners add column if not exists stats_updated_at timestamptz;
