-- 파트너 마커(금색 핀 + 채널 썸네일)용: partners 테이블에 채널 아바타 URL 컬럼 추가.
-- Supabase SQL Editor(Dashboard > SQL Editor)에서 실행.
--
-- 안전성: nullable 컬럼 추가라 기존 데이터 안 깨짐. 기존 파트너 행은 avatar_url = NULL이 된다.
-- (NULL이어도 마커가 깨지지 않게 코드에서 fallback 처리: 데모 썸네일/금색 핀 폴백.
--  기존 파트너 아바타는 다음 재연동(OAuth) 시 채워지거나, 필요하면 별도 backfill.)

alter table partners add column if not exists avatar_url text;
