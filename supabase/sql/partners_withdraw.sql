-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- 'withdrawn' is a soft-delete for "탈퇴" — keeps the row (and history) but
-- revokes dashboard access, since the dashboard only allows status='approved'.

alter table partners drop constraint if exists partners_status_check;
alter table partners add constraint partners_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

alter table partners add column if not exists monthly_report_opt_in boolean not null default true;
