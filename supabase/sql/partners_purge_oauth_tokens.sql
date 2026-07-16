-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
--
-- 파트너 OAuth 토큰 파기 — 기존에 저장된 토큰 NULL 정리.
--
-- 배경: 법무법인 덕수 자문(2026-05-27). 파트너 OAuth 토큰의 '미사용 보관'은
-- 최소수집·파기 원칙(개인정보보호법 제3조①, 제21조①) 위반 소지 → 파기 권고.
-- 채널 소유권 증명(fetchOwnChannel, mine=true)은 access token 하나로 첫 DB write
-- 이전에 이미 완결되므로, 토큰 보관은 목적 달성 이후의 잉여였다.
-- 코드는 더 이상 토큰을 저장하지 않는다(수집·저장 중단 배치). 이 스크립트는
-- 그 이전에 이미 쌓인 행의 잔여 토큰을 지운다.
--
-- ★ 실행 순서 (반드시 지킬 것)
--   1) 코드 배포 (토큰 저장 중단) ← 선행
--   2) 배포 Ready 확인 + 신규 가입/재연동 정상 확인
--   3) 이 스크립트 실행 (기존 토큰 NULL 파기)   ← 지금 이 파일
--   4) (별도 배치) 컬럼 DROP — 아래 마지막 섹션 참고
--
--   컬럼을 코드보다 먼저 건드리면 구 코드가 없는 컬럼을 참조해
--   파트너 가입이 전면 장애난다. 순서를 뒤집지 말 것.


-- ── STEP 1. 실행 전 확인 — 몇 건이 토큰을 들고 있나 ──────────────────────
select
  count(*)                                                  as total_partners,
  count(*) filter (where youtube_access_token is not null)  as has_access_token,
  count(*) filter (where youtube_refresh_token is not null) as has_refresh_token
from partners;

-- 어느 행인지 눈으로 확인 (토큰 값 자체는 출력하지 않는다 — 존재 여부만)
select
  id,
  channel_name,
  status,
  created_at,
  (youtube_access_token  is not null) as has_access_token,
  (youtube_refresh_token is not null) as has_refresh_token
from partners
where youtube_access_token is not null
   or youtube_refresh_token is not null
order by created_at;


-- ── STEP 2. 파기 실행 ────────────────────────────────────────────────────
-- status 무관 전체 대상 (approved/withdrawn/pending 모두). 토큰을 읽는 코드가
-- 0곳이므로 어떤 행의 토큰을 지워도 기능 회귀가 없다.
update partners
set youtube_access_token  = null,
    youtube_refresh_token = null
where youtube_access_token  is not null
   or youtube_refresh_token is not null;
-- 반환되는 UPDATE 건수 = 실제로 파기된 행 수. STEP 1의 집계와 대조할 것.


-- ── STEP 3. 실행 후 확인 — 기대값 0 ──────────────────────────────────────
select count(*) as remaining_rows_with_token
from partners
where youtube_access_token  is not null
   or youtube_refresh_token is not null;
-- ★ 0이어야 한다. 0이 아니면 파기 실패 — 본부에 보고할 것.


-- ── STEP 4. (아직 실행하지 마시오) 향후 컬럼 DROP ────────────────────────
-- 컬럼 자체를 없애는 것은 별도 배치. 아래를 실행하기 전 반드시 확인:
--   (a) 토큰을 저장하는 코드가 배포본에 0곳인지 (grep: youtube_access_token)
--   (b) 탈퇴/관리자해제 경로의 `youtube_access_token: null` 대입 2곳이
--       먼저 제거·배포됐는지 — 남아 있으면 DROP 직후 없는 컬럼 참조로
--       탈퇴가 500 난다:
--         src/app/partner/dashboard/actions.ts:114
--         src/app/admin/partners/[id]/actions.ts:93
--   (c) 죽은 inbound 경로(submitPartnerApplication)에서도 제거됐는지 — 완료됨
--
-- alter table partners
--   drop column if exists youtube_access_token,
--   drop column if exists youtube_refresh_token;
--
-- DROP 후에는 partners.sql 헤더 주석(RLS 근거를 "Stores OAuth tokens"로 설명)도
-- 같이 갱신할 것. RLS 정책 자체는 유지 — 토큰 외 개인정보를 여전히 보유한다.
