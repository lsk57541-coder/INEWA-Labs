-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- 문의 답장(가벼운 버전): inquiries에 답장 컬럼 추가 + 사용자가 자기 문의(+답장) 조회 RLS.
-- 안전성: nullable 컬럼 추가 + 정책 추가만. 기존 데이터/행 변경 없음. 재실행 안전.

-- 1) 답장 컬럼 (답장 전엔 NULL)
alter table inquiries add column if not exists reply      text;        -- 관리자 답장 내용
alter table inquiries add column if not exists replied_at timestamptz; -- 답장 시각

-- 2) 사용자가 자기 문의(+답장)를 조회할 수 있게 (관리자 전체 조회 정책과 공존)
--    SELECT 정책 2개는 PERMISSIVE라 OR로 결합 → 관리자=전체, 사용자=본인 것.
drop policy if exists "select own inquiry" on inquiries;
create policy "select own inquiry" on inquiries
  for select using (auth.uid() = user_id);

-- 참고:
--  · 답장 쓰기(reply/replied_at update)는 기존 "admin can update inquiries"(for update, 관리자)에
--    이미 포함됨 — 컬럼 단위 제한이 없으므로 status뿐 아니라 reply/replied_at도 관리자가 update 가능.
--    → 추가 update 정책 불필요.
--  · status는 'unread'/'read'(관리자가 문의를 읽었는지) 그대로. 답장 여부는 reply IS NOT NULL로 판단
--    하므로 status에 'replied'를 추가하지 않는다(과설계 방지).
