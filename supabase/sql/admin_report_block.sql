-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Lets a single admin report (other than wrong_address, which is just a
-- location-fix request, not a moderation flag) immediately block a video
-- for everyone, instead of waiting for the usual 3-report threshold.

alter table location_reports add column if not exists is_admin_report boolean not null default false;
