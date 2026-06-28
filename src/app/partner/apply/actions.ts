'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PENDING_CHANNEL_COOKIE, type PendingChannel } from '@/lib/partnerPendingChannel'
import { PARTNER_CATEGORIES, KOREA_REGIONS } from '@/lib/partnerOptions'
import { sendPartnerApplicationEmail, sendPartnerApprovedEmail } from '@/lib/email'

// Outbound 채널은 관리자가 outreach_targets에 등록할 때 이미 category/region을
// 입력해뒀으므로, 가입 폼에서 다시 받지 않고 여기서 복사해온다. 매칭되는 대상이
// 없으면(Inbound로 직접 들어온 경우) null로 둔다.
async function findOutreachMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  channelId: string,
  channelName: string
): Promise<{ category: string | null; region: string | null } | null> {
  const byUrl = await supabase
    .from('outreach_targets')
    .select('category, region')
    .ilike('youtube_url', `%${channelId}%`)
    .limit(1)
    .maybeSingle()
  if (byUrl.data) return byUrl.data

  const byName = await supabase
    .from('outreach_targets')
    .select('category, region')
    .ilike('channel_name', channelName)
    .limit(1)
    .maybeSingle()
  return byName.data
}

// Outbound 가입 플로우: 우리가 먼저 컨택해 검증한 채널이므로 admin 심사 없이
// OAuth 연동만으로 즉시 승인한다. 쿠키 핸드오프 없이 OAuth 콜백 Route Handler
// (api/auth/youtube/route.ts)에서 채널을 가져온 직후 바로 호출한다 — 쿠키
// 삭제/설정은 Server Action이나 Route Handler 안에서만 가능해서, 페이지 렌더링
// 중에 호출하면 에러가 난다.
export async function completePartnerSignup(channel: PendingChannel) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const match = await findOutreachMatch(supabase, channel.channelId, channel.channelName)

  const { error } = await supabase.from('partners').insert({
    user_id: user.id,
    channel_id: channel.channelId,
    channel_name: channel.channelName,
    subscriber_count: channel.subscriberCount,
    categories: match?.category ? [match.category] : null,
    region: match?.region ?? null,
    status: 'approved',
    grade: 'general',
    avatar_url: channel.thumbnail,
    youtube_access_token: channel.accessToken,
    youtube_refresh_token: channel.refreshToken,
  })

  if (error) {
    redirect(error.code === '23505' ? '/partner/apply?error=already_applied' : '/partner/apply?error=youtube_failed')
  }

  if (user.email) {
    try {
      await sendPartnerApprovedEmail(user.email, channel.channelName, 'general')
    } catch {}
  }

  redirect('/partner/dashboard')
}

// --- Inbound(유튜버 자발적 신청) 전용, 현재 /partner/apply에서는 호출하지
// 않음. Inbound 신청을 다시 열 때 카테고리/지역 입력 폼(PartnerApplyForm)과
// 함께 재사용할 수 있도록 admin 심사 플로우째 남겨둔다. ---
export interface SubmitState {
  error?: string
}

export async function submitPartnerApplication(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const cookieStore = await cookies()
  const raw = cookieStore.get(PENDING_CHANNEL_COOKIE)?.value
  if (!raw) return { error: '채널 연동이 만료되었습니다. YouTube 채널을 다시 연동해주세요.' }

  let channel: PendingChannel
  try {
    channel = JSON.parse(raw) as PendingChannel
  } catch {
    return { error: '채널 연동 정보를 읽지 못했습니다. 다시 연동해주세요.' }
  }

  const categories = formData.getAll('categories').filter((c): c is string =>
    typeof c === 'string' && (PARTNER_CATEGORIES as readonly string[]).includes(c)
  )
  const region = formData.get('region') as string
  const agreed = formData.get('agree') === 'on'

  if (categories.length === 0) return { error: '콘텐츠 카테고리를 1개 이상 선택해주세요.' }
  if (!region || !(KOREA_REGIONS as readonly string[]).includes(region)) return { error: '활동 지역을 선택해주세요.' }
  if (!agreed) return { error: '자막 데이터 활용 동의는 필수입니다.' }

  const { error } = await supabase.from('partners').insert({
    user_id: user.id,
    channel_id: channel.channelId,
    channel_name: channel.channelName,
    subscriber_count: channel.subscriberCount,
    categories,
    region,
    youtube_access_token: channel.accessToken,
    youtube_refresh_token: channel.refreshToken,
  })

  if (error) {
    if (error.code === '23505') return { error: '이미 신청된 채널입니다.' }
    return { error: error.message }
  }

  if (user.email) {
    try {
      await sendPartnerApplicationEmail(user.email, channel.channelName)
    } catch {}
  }

  cookieStore.delete(PENDING_CHANNEL_COOKIE)
  redirect('/partner/apply/complete')
}
