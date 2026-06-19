-- This one is NOT just "run in SQL Editor" — the Edge Function itself must
-- be deployed first via the Supabase CLI (this chat can't do that part):
--
--   1. npm install -g supabase
--   2. supabase login
--   3. supabase link --project-ref bpqwawedbgpbygcahalr
--   4. supabase functions deploy monthly-report
--   5. supabase secrets set RESEND_API_KEY=re_xxx
--      (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided to every
--      Edge Function, no need to set those manually)
--
-- Once deployed, run the SQL below in the SQL Editor to schedule it for
-- 00:00 on the 1st of every month. Replace <SERVICE_ROLE_KEY> with the
-- project's service role key (Settings > API) so the function can be
-- invoked — already done for this project; this file just documents how,
-- since the real key must never be committed to git.
--
-- Already applied to this project as cron job id 1 (verified working via a
-- manual invoke). Re-running is safe — cron.schedule upserts by job name.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'monthly-partner-report',
  '0 0 1 * *',
  $$
  select net.http_post(
    url := 'https://bpqwawedbgpbygcahalr.supabase.co/functions/v1/monthly-report',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
