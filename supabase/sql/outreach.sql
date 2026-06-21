-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Admin-only cold outreach: tracking YouTuber channels to pitch, the
-- pitch templates, and a log of what was actually sent.

create table if not exists outreach_targets (
  id uuid primary key default gen_random_uuid(),
  channel_name text not null,
  youtube_url text,
  contact_email text,
  category text,
  region text,
  memo text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'followed_up', 'replied', 'converted', 'rejected')),
  sent_at timestamptz,
  followed_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists outreach_logs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references outreach_targets(id) on delete cascade,
  template_name text,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id)
);

-- Not in the original spec, but the templates page needs somewhere to
-- persist edits — added so "맛집형 / 여행형 / 지역형" templates are
-- actually editable instead of hardcoded.
create table if not exists outreach_templates (
  name text primary key,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table outreach_targets enable row level security;
alter table outreach_logs enable row level security;
alter table outreach_templates enable row level security;

create policy "admin manages outreach_targets" on outreach_targets
  for all using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "admin manages outreach_logs" on outreach_logs
  for all using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "admin manages outreach_templates" on outreach_templates
  for all using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

insert into outreach_templates (name, subject, body) values
  (
    '맛집형',
    '[AI MAPTUBE] {{채널명}} 채널 파트너십 제안드립니다',
    '안녕하세요, {{채널명}} 채널 운영자님.

유튜브 영상 속 장소를 지도로 자동 연결해주는
AI MAPTUBE 서비스를 만들고 있습니다.

파트너로 등록하시면:
✅ 영상 속 장소가 지도에 자동 노출됩니다
✅ 월간 트래픽 리포트를 무료로 드립니다
✅ 채널 전용 지도 페이지를 드립니다
✅ 초기 파트너 수익 공유 우대 조건을 드립니다

👉 파트너 신청: https://maptube.ai/partner/apply

감사합니다. AI MAPTUBE 팀 드림'
  ),
  (
    '여행형',
    '[AI MAPTUBE] {{채널명}} 채널 파트너십 제안드립니다',
    '안녕하세요, {{채널명}} 채널 운영자님.

유튜브 영상 속 장소를 지도로 자동 연결해주는
AI MAPTUBE 서비스를 만들고 있습니다.

파트너로 등록하시면:
✅ 영상 속 장소가 지도에 자동 노출됩니다
✅ 월간 트래픽 리포트를 무료로 드립니다
✅ 채널 전용 지도 페이지를 드립니다
✅ 초기 파트너 수익 공유 우대 조건을 드립니다

👉 파트너 신청: https://maptube.ai/partner/apply

감사합니다. AI MAPTUBE 팀 드림'
  ),
  (
    '지역형',
    '[AI MAPTUBE] {{채널명}} 채널 파트너십 제안드립니다',
    '안녕하세요, {{채널명}} 채널 운영자님.

유튜브 영상 속 장소를 지도로 자동 연결해주는
AI MAPTUBE 서비스를 만들고 있습니다.

파트너로 등록하시면:
✅ 영상 속 장소가 지도에 자동 노출됩니다
✅ 월간 트래픽 리포트를 무료로 드립니다
✅ 채널 전용 지도 페이지를 드립니다
✅ 초기 파트너 수익 공유 우대 조건을 드립니다

👉 파트너 신청: https://maptube.ai/partner/apply

감사합니다. AI MAPTUBE 팀 드림'
  )
on conflict (name) do nothing;
