-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Adds the missing delete policy so a user can un-report (toggle off) their own report.

create policy "delete own reports" on location_reports
  for delete using (auth.uid() = user_id);
