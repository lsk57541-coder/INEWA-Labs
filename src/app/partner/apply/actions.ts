'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PENDING_CHANNEL_COOKIE, type PendingChannel } from '@/lib/partnerPendingChannel'
import { PARTNER_CATEGORIES, KOREA_REGIONS } from '@/lib/partnerOptions'
import { sendPartnerApplicationEmail } from '@/lib/email'

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
