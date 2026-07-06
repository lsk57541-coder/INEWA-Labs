-- ⚠️ 초안 — INEWA 검토 후 Supabase SQL Editor에서 직접 실행할 것.
--
-- L7 진단 로그(search_funnel_logs) 7일 자동삭제. 임시 진단 도구라 필요 최소 보존.
-- 기존 cron 패턴(refresh_stats_cron.sql / monthly_report_cron.sql)과 동일하게 cron.schedule 사용.
-- 재실행 안전 — cron.schedule은 job 이름으로 upsert.
--
-- ★대상 테이블은 오직 search_funnel_logs 하나뿐.
--   감사 자산(consent_logs / verification_logs / video_referrals)은 절대 대상이 아니며,
--   그 테이블들은 영구 append-only로 어떤 자동삭제 cron에도 포함되지 않는다.

create extension if not exists pg_cron;

select cron.schedule(
  'search-funnel-logs-cleanup',
  '15 3 * * *',                        -- 매일 03:15 (KST 아님, UTC 기준 — 필요시 조정)
  $$ delete from search_funnel_logs where created_at < now() - interval '7 days'; $$
);
