-- ⚠️ 초안 — INEWA 검토 후 Supabase SQL Editor에서 직접 실행할 것. (이 파일 자체는 실행되지 않음)
--
-- L7 단계별 퍼널 계측용 임시 진단 테이블.
-- 실시간 키워드/채널 검색이 "수집→추출→지오코딩→반경→표시" 5단계에서
-- 어디서 얼마나 새는지 카운트만 남긴다. L1(명시 주소 지오코딩) 효과 측정용.
--
-- ★성격 구분 (절대 섞지 말 것):
--   • 이 테이블(search_funnel_logs) = 임시 진단 도구. 7일 후 pg_cron 자동삭제.
--   • 감사 자산(consent_logs / verification_logs / video_referrals) = 영구 append-only.
--     UPDATE/DELETE 정책 미생성. 이 파일의 cron은 그 테이블들을 절대 건드리지 않는다.
--
-- ★개인정보 원칙:
--   • user_id / ip 컬럼 없음 — 어떤 식별자와도 결합하지 않는다.
--   • 정밀 검색좌표 저장 안 함. region(시/군/구 단위 텍스트)만 저장 → 간접 식별 위험 차단.
--   • query(검색어 원문)만 저장. service_role만 접근(RLS로 anon 전면 차단), 7일 보존.

create table if not exists search_funnel_logs (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  query             text,                              -- 검색어 원문 (채널검색은 null). PII 결합 금지.
  search_type       text not null check (search_type in ('keyword','channel')),
  region            text,                              -- 시/군/구 단위(예: '중구','강남'). 정밀좌표 아님. null 가능.
  category          text,                              -- classifyCategory 결과(food/cafe/default 등)
  radius            real,                              -- 검색 반경(km). 채널검색은 무한대라 null 저장.
  collected         integer not null default 0,        -- ① YouTube 수집 고유 영상 수
  extract_targets   integer not null default 0,        -- ② 장소추출 대상 영상 수(geoValid+adminGeo+noGeo 캡 적용)
  extracted_ok      integer not null default 0,        -- ③ 좌표 확보 성공 해석 수(지오코딩/좌표내장). 모음영상은 장소 단위.
  radius_pass       integer not null default 0,        -- ④ 반경 통과 해석 수
  displayed         integer not null default 0,        -- ⑤ 파이프라인 최종 표시 행 수(confidence/duration/신고 필터 후)
  registered_merged integer not null default 0         -- 참고: 상단 병합된 등록장소(admin/partner) 수(퍼널 밖)
);

-- 조회 편의: 최근 로그부터.
create index if not exists search_funnel_logs_created_at_idx
  on search_funnel_logs (created_at desc);

-- RLS: 켜되 permissive 정책을 만들지 않는다 → anon/authenticated(anon 키) 전면 차단.
-- service_role 키는 RLS를 우회하므로 서버 insert / SQL Editor 진단조회만 가능(관리자 전용).
alter table search_funnel_logs enable row level security;

-- (의도적으로 select/insert/update/delete 정책 미생성. 감사 자산과 달리 이 테이블은
--  cron이 DELETE 하지만, DELETE는 service_role/postgres가 수행하며 RLS를 우회한다.)


-- ─────────────────────────────────────────────────────────────────────────
-- 진단 조회 예시 (SQL Editor에서 service_role로 실행). L1 배포 전 "before 스냅샷".
-- ─────────────────────────────────────────────────────────────────────────

-- ① 키워드 검색 퍼널 통과율(최근 7일 집계). 각 단계가 앞 단계 대비 몇 %인지.
-- select
--   count(*)                                              as searches,
--   round(avg(collected), 1)                              as avg_collected,
--   round(avg(extract_targets), 1)                        as avg_extract_targets,
--   round(avg(extracted_ok), 1)                           as avg_extracted_ok,
--   round(avg(radius_pass), 1)                            as avg_radius_pass,
--   round(avg(displayed), 1)                              as avg_displayed,
--   round(100.0 * sum(extracted_ok)  / nullif(sum(extract_targets),0), 1) as pct_geocode,   -- 지오코딩 성공률
--   round(100.0 * sum(radius_pass)   / nullif(sum(extracted_ok),0), 1)    as pct_radius,     -- 반경 통과율
--   round(100.0 * sum(displayed)     / nullif(sum(radius_pass),0), 1)     as pct_final       -- 최종 필터 통과율
-- from search_funnel_logs
-- where search_type = 'keyword' and created_at > now() - interval '7 days';

-- ② "0개 표시"로 끝난 검색 — 커버리지 구멍. 어느 단계에서 0이 됐는지.
-- select created_at, query, region, category, collected, extract_targets, extracted_ok, radius_pass, displayed
-- from search_funnel_logs
-- where displayed = 0 and search_type = 'keyword'
-- order by created_at desc limit 50;

-- ③ 특정 검색어 추적(예: 테스트 재현 '서울 맛집').
-- select created_at, region, radius, collected, extract_targets, extracted_ok, radius_pass, displayed
-- from search_funnel_logs
-- where query = '서울 맛집'
-- order by created_at desc limit 20;
