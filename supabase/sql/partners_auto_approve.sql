-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Outbound(아웃리치로 우리가 먼저 컨택한) 채널은 이미 검증되었으므로, OAuth
-- 연동만으로 즉시 승인한다. categories/region은 더 이상 가입 폼에서 입력받지
-- 않고 outreach_targets 값을 복사해 채우므로 nullable로 바꾼다. Inbound(자발적
-- 신청)를 다시 받을 경우를 위해 pending 상태 자체는 그대로 둔다.

alter table partners alter column status set default 'approved';
alter table partners alter column categories drop not null;
alter table partners alter column region drop not null;
