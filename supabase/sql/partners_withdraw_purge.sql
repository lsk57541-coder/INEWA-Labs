-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
--
-- 파트너 해지 시 개인정보 파기 — (B′) tombstone 설계용 스키마 변경.
--
-- 배경: 해지는 지금까지 status 플립 + 토큰 null 뿐이라 채널 식별정보가 전부 남았다.
-- 파트너십약관 제10조①이 파기 목록을 열거하고 ⑤항이 "식별자 분리 보관"을 규정하므로
-- 코드가 실제로 파기하도록 바꾸고, 그러려면 channel_name의 NOT NULL을 풀어야 한다.
--
-- 파기(null): channel_name, avatar_url, subscriber_count, user_id,
--             categories, region, grade, rejection_reason
-- 존치:       id, channel_id, created_at, status='withdrawn',
--             monthly_report_opt_in, is_demo
--
-- ★ channel_id 존치 근거 = 수신거부 이행(개인정보보호법 제21조③ "보존 시 다른
--   개인정보와 분리하여 저장·관리"). tombstone은 나머지 개인정보를 전부 제거한
--   형태라 그 분리 보관 구조에 그대로 해당한다. 약관 제10조⑤가 이를 고지하며,
--   파트너가 요청하면 지체 없이 파기한다.
--   ※ 실무적으로도 channel_id가 있어야 재가입 시 completePartnerSignup의
--     existing 조회(channel_id 키)가 적중해 UPDATE 브랜치를 타고, 그 브랜치가
--     monthly_report_opt_in을 건드리지 않으므로 수신거부가 보존된다.
--     channel_id를 null로 만들면 NULL = 'UC…' 가 never true라 조회가 영구히
--     빗나가고 INSERT 브랜치로 빠져 opt_in이 default true로 부활한다.
--
-- ★ 존치 목록을 파기하면 안 되는 이유(코드 근거):
--   created_at            → PartnerStats.tsx:31 이 slice(0,7)를 null 가드 없이 호출 → admin 페이지 전체 크래시
--   monthly_report_opt_in → 수신거부(법정). not null default true 라 값이 사라지면 재구독됨
--   channel_id            → 위 참조
--   is_demo               → not null. 데모 태깅


-- ── STEP 1. 실행 전 확인 — 현재 nullable 상태 ────────────────────────────
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'partners'
  and column_name in (
    'channel_id','channel_name','avatar_url','subscriber_count','user_id',
    'categories','region','grade','rejection_reason',
    'created_at','status','monthly_report_opt_in','is_demo'
  )
order by column_name;
-- 기대: channel_name = NO(변경 대상) / channel_id = NO(존치, 건드리지 않음)
--       파기 대상 나머지(avatar_url·subscriber_count·user_id·categories·region·
--       grade·rejection_reason)는 이미 YES → ALTER 불필요
-- ★ is_demo 의 is_nullable·column_default 를 여기서 확인할 것 — 저장소에 SQL 정의가
--   0건이라 대시보드에서 수동 추가된 컬럼이다. 코드는 `=== true` 엄격비교로 방어했다.


-- ── STEP 2. 스키마 변경 — 이번에 필요한 유일한 ALTER ─────────────────────
-- 메타데이터만 바꾸는 연산(테이블 재작성 없음). ACCESS EXCLUSIVE 락이 아주 짧게 걸린다.
-- 선례: partners_auto_approve.sql 이 categories/region 에 동일하게 적용했다.
alter table partners alter column channel_name drop not null;

-- ★ channel_id 는 NOT NULL·UNIQUE 를 그대로 둔다(존치 목록). 절대 풀지 말 것 —
--   풀면 tombstone 이 여러 개 쌓일 때 unique 가 NULL 을 서로 다른 값으로 취급해
--   중복을 막지 못하고, 무엇보다 위에 적은 수신거부 부활 경로가 열린다.


-- ── STEP 3. 실행 후 확인 — 기대값 ───────────────────────────────────────
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'partners'
  and column_name in ('channel_id','channel_name');
-- 기대: channel_name = YES / channel_id = NO


-- ── STEP 4. (참고) 파기 동작 확인 — 코드 배포 후 ─────────────────────────
-- 파트너 해지를 1회 수행한 뒤 tombstone 형상을 눈으로 확인한다(토큰 값 미출력).
-- select
--   id, channel_id, created_at, status, monthly_report_opt_in, is_demo,   -- 존치: 값이 있어야 함
--   channel_name, avatar_url, subscriber_count, user_id, categories, region, grade, rejection_reason
--   -- ↑ 파기: 전부 null 이어야 함
-- from partners where status = 'withdrawn';


-- ── 주의: 다른 마이그레이션과의 순서 ─────────────────────────────────────
-- partners_purge_oauth_tokens.sql STEP 4(토큰 컬럼 DROP)는 여전히 실행하지 않는다.
-- 그 파일은 DROP 전에 youtube_*_token null 대입 2곳을 먼저 제거하라고 요구하는데,
-- 이번 배치가 그 두 줄을 처리한다:
--   • partner/dashboard/actions.ts  — 파기 payload 에 흡수(토큰도 파기 대상이라 계속 null 로 설정됨)
--   • admin/partners/[id]/actions.ts — withdrawn 분기에서 그대로 유지
-- 즉 이번 배치는 그 선행조건을 아직 만족시키지 않는다(대입이 남아 있다).
-- 토큰 컬럼 DROP 을 하려면 그때 두 대입을 별도로 제거·배포한 뒤 진행할 것.
