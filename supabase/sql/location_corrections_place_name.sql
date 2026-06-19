-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Splits "wrong address" reports into separately-correctable address vs.
-- business name, instead of one combined field. A correction can now fix
-- just the name (location stays put), just the address (name re-resolved
-- normally at the new point), or both — so address is no longer required.

alter table location_corrections add column if not exists place_name text;
alter table location_corrections alter column address drop not null;
