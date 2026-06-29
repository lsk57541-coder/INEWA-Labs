-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- 사용자 문의(문의하기) 저장 테이블. 신규 테이블이라 기존 데이터/행에 영향 없음.
--
-- 사용자 식별: 로그인 사용자는 auth.users(id). 표시용 닉네임은 profiles에 있지만,
-- 문의는 "접수 시점 기록"이라 nickname을 join 대신 행에 비정규화 저장(favorites가
-- title/thumbnail을 복사 저장하는 것과 동일 관례). 닉네임 변경/계정 삭제 후에도 보존된다.

create table if not exists inquiries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,  -- 로그인 사용자. 계정 삭제 시 문의는 보존(null)
  nickname   text,                                               -- 제출 시점 닉네임(비정규화) — 변경/탈퇴에도 보존
  title      text not null,                                      -- 제목
  content    text not null,                                      -- 내용
  status     text not null default 'unread' check (status in ('unread', 'read')),
  created_at timestamptz not null default now()
);

-- 관리자 받은함 정렬용(최신순)
create index if not exists inquiries_created_at_idx on inquiries (created_at desc);

alter table inquiries enable row level security;

-- 본인만 자기 user_id로 문의 작성(로그인 필요) — drop+create로 재실행 안전
drop policy if exists "insert own inquiry" on inquiries;
create policy "insert own inquiry" on inquiries
  for insert with check (auth.uid() = user_id);

-- 관리자만 전체 조회
drop policy if exists "admin can read inquiries" on inquiries;
create policy "admin can read inquiries" on inquiries
  for select using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- 관리자만 상태 변경(unread -> read)
drop policy if exists "admin can update inquiries" on inquiries;
create policy "admin can update inquiries" on inquiries
  for update using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- 옵션 (필요 시 주석 해제):
-- 회신용 이메일 비정규화:
-- alter table inquiries add column if not exists email text;
-- 사용자가 자기 문의 내역도 조회하게 하려면:
-- drop policy if exists "select own inquiry" on inquiries;
-- create policy "select own inquiry" on inquiries
--   for select using (auth.uid() = user_id);
