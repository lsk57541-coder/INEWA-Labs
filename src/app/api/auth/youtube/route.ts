import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  fetchOwnChannel,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_PATH,
} from '@/lib/googleOAuth'
import { type PendingChannel } from '@/lib/partnerPendingChannel'
import { createClient } from '@/lib/supabase/server'
import { completePartnerSignup } from '@/app/partner/apply/actions'
import { logConsent } from '@/lib/consent'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value
  cookieStore.delete(OAUTH_STATE_COOKIE)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // An existing approved partner hitting this is reconnecting from
  // settings, not applying for the first time — send errors back there.
  const { data: existingApproved } = user
    ? await supabase.from('partners').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle()
    : { data: null }
  const errorTarget = existingApproved ? '/partner/dashboard/settings' : '/partner/apply'

  if (errorParam) {
    return NextResponse.redirect(`${origin}${errorTarget}?error=youtube_denied`)
  }
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${origin}${errorTarget}?error=youtube_failed`)
  }

  const tokens = await exchangeCodeForTokens(code, `${origin}${OAUTH_REDIRECT_PATH}`)
  if (!tokens) {
    return NextResponse.redirect(`${origin}${errorTarget}?error=youtube_failed`)
  }

  const channel = await fetchOwnChannel(tokens.access_token)
  if (!channel) {
    return NextResponse.redirect(`${origin}${errorTarget}?error=no_channel`)
  }

  // Reconnecting an already-approved channel: just refresh its tokens in
  // place instead of routing through the application flow again. Only
  // 'approved' counts — a withdrawn row for the same channel/user must NOT
  // short-circuit here, or the applicant gets bounced to a dashboard they
  // can no longer access without ever re-applying.
  if (user) {
    const { data: ownedPartner } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', user.id)
      .eq('channel_id', channel.channelId)
      .eq('status', 'approved')
      .maybeSingle()
    if (ownedPartner) {
      await supabase
        .from('partners')
        .update({
          channel_name: channel.channelName,
          subscriber_count: channel.subscriberCount,
          avatar_url: channel.thumbnail,  // NULL이던 기존 파트너도 재연동 시 채워짐
          // ★ OAuth 토큰 미저장 — 재연동의 목적은 채널 정보 갱신이고, 그 값은
          // 위 fetchOwnChannel로 이미 다 받았다. 토큰은 여기서 버려진다.
        })
        .eq('id', ownedPartner.id)
      // 재연동 성사 직후 동의 로그(append-only, 실패해도 재연동은 완료 — logConsent는 throw 안 함).
      await logConsent(supabase, {
        userId: user.id,
        partnerId: ownedPartner.id,
        channelId: channel.channelId,
        event: 'reconnect',
      })
      return NextResponse.redirect(`${origin}/partner/dashboard/settings?reconnected=1`)
    }
  }

  // Outbound 채널은 카테고리/지역 입력 폼이 따로 없으므로, 쿠키로 다음 페이지에
  // 넘기지 않고 이 Route Handler 안에서 곧바로 가입을 완료한다.
  const pending: PendingChannel = {
    channelId: channel.channelId,
    channelName: channel.channelName,
    subscriberCount: channel.subscriberCount,
    thumbnail: channel.thumbnail,
  }
  await completePartnerSignup(pending)
}
