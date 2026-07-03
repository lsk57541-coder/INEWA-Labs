create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-stats-weekly',
  '30 18 * * 0',
  $$
  select net.http_post(
    url := 'https://bpqwawedbgpbygcahalr.supabase.co/functions/v1/refresh-stats',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
