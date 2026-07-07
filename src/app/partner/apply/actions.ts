'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { PENDING_CHANNEL_COOKIE, type PendingChannel } from '@/lib/partnerPendingChannel'
import { PARTNER_CATEGORIES, KOREA_REGIONS } from '@/lib/partnerOptions'
import { sendPartnerApplicationEmail, sendPartnerApprovedEmail } from '@/lib/email'
import { logConsent } from '@/lib/consent'

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

  // ★ 재활성화는 "다른/옛 유저 소유 채널 행 인수"라 RLS "own" 스코프로는 그 행을 보지도(select own:
  // auth.uid()=user_id) 바꾸지도(update 정책은 admin 전용뿐) 못한다. 그래서 partners 조회/갱신/삽입은
  // service_role로 RLS를 우회한다(같은 채널을 카카오→구글로 옮기려면 반드시 필요).
  //
  // ★★안전선(가장 중요): 여기서 인수하는 channel.channelId 는 반드시 이 함수의 호출부가
  // fetchOwnChannel(provider_token, mine=true)로 "서버에서" 방금 증명한 값이어야 한다. 두 호출부
  // (partner/apply/callback, api/auth/youtube)는 모두 fetchOwnChannel 반환값으로 PendingChannel을
  // 구성하므로 이 계약이 지켜진다. 클라이언트가 임의 channel_id를 주입해 이 함수를 부르면 남의 파트너
  // 행 탈취가 되므로 절대 금지 — 유효 provider_token은 실제 채널 소유자만 발급받는다는 게 유일한 인가 근거다.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) redirect('/partner/apply?error=youtube_failed')
  const admin = createServiceClient(url, serviceKey)

  // channel_id가 unique라 무조건 INSERT하면 같은 채널 행(특히 탈퇴=withdrawn)과 충돌(23505)나
  // 재가입이 막힌다. 같은 채널 행이 있으면 INSERT 대신 UPDATE로 재활성화(탈퇴/다른 계정도 소유증명되면 인수). 없으면 신규 INSERT.
  const { data: existing } = await admin
    .from('partners')
    .select('id, grade')
    .eq('channel_id', channel.channelId)
    .maybeSingle()

  const grade: string = existing?.grade ?? 'general' // 기존 등급 유지(premium 강등 금지), 없으면 general

  if (existing) {
    const { error } = await admin
      .from('partners')
      .update({
        user_id: user.id,                 // 소유 증명된 현재 로그인(구글) 유저로 갱신 — cross-user 인수
        channel_name: channel.channelName,
        subscriber_count: channel.subscriberCount,
        avatar_url: channel.thumbnail,    // 이번 연동에서 받아온 아바타
        status: 'approved',               // 재활성화(withdrawn→approved)
        grade,                            // 기존 등급 유지
        youtube_access_token: channel.accessToken,
        youtube_refresh_token: channel.refreshToken,
        // created_at·categories·region·is_demo는 건드리지 않음(원래 가입정보 보존)
      })
      .eq('id', existing.id)
    if (error) redirect('/partner/apply?error=youtube_failed')
  } else {
    const { error } = await admin.from('partners').insert({
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
    // unique 경합(드물게 동시요청) 시에도 이미 등록된 채널 안내로
    if (error) redirect(error.code === '23505' ? '/partner/apply?error=already_applied' : '/partner/apply?error=youtube_failed')
  }

  // 가입(C)/재활성화(B) 성사 직후 동의 로그(append-only). 위 insert/update 문은 변경하지 않고,
  // partner_id만 channel_id(unique)로 조회해 기록. logConsent는 throw하지 않아 가입을 막지 않음.
  const { data: signedPartner } = await admin
    .from('partners').select('id').eq('channel_id', channel.channelId).maybeSingle()
  if (signedPartner?.id) {
    await logConsent(supabase, {
      userId: user.id,
      partnerId: signedPartner.id,
      channelId: channel.channelId,
      event: existing ? 'reactivate' : 'signup',
    })
  }

  if (user.email) {
    try {
      await sendPartnerApprovedEmail(user.email, channel.channelName, grade)
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
