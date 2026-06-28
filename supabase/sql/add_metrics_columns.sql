-- 2단계: 입력 시 조회수·구독자수·업로드날짜 자동 저장용 컬럼.
-- Supabase SQL Editor(Dashboard > SQL Editor)에서 실행.
-- 전부 nullable(default NULL) — 기존 행 안 깨짐. 코드에서 NULL은 0으로 처리되어
-- 미backfill 등록장소는 1단계 "항상 표시"(데모 보호) 거동을 그대로 유지한다.
-- (3단계 backfill로 기존 제주 데모 ~1,200곳을 채우면 정상 필터됨.)

-- videos: published_at은 이미 존재. view_count/subscriber_count만 추가.
alter table videos add column if not exists view_count integer;
alter table videos add column if not exists subscriber_count integer;

-- places: 셋 다 신규.
alter table places add column if not exists view_count integer;
alter table places add column if not exists subscriber_count integer;
alter table places add column if not exists published_at timestamptz;
