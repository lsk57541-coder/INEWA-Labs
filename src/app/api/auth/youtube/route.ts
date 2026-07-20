import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  fetchOwnChannel,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_PATH,
} from '@/lib/googleOAuth'
import {
  PENDING_CHANNEL_COOKIE,
  PENDING_CHANNEL_MAX_AGE_SEC,
  type PendingChannel,
} from '@/lib/partnerPendingChannel'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { logConsent } from '@/lib/consent'

// ★ partners 는 UPDATE RLS 정책이 admin 전용 하나뿐이라 파트너 세션(role='user')으로는
// 자기 행조차 못 고친다(조용한 0행). withdrawPartner/updateReportOptIn(dashboard/actions.ts)이
// 쓰는 service_role 패턴을 그대로 복제한다. 인가는 약해지지 않는다 — 아래 재연동 블록은 서버
// getUser() 기반으로 대상 행을 이미 본인 소유(ownedPartner)로 한정한 뒤에만 UPDATE 한다.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('서버 설정 오류로 처리하지 못했습니다.')
  return createServiceClient(url, serviceKey)
}

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
      // ★ service_role 로 UPDATE — RLS-bound 로는 admin 전용 정책 탓에 0행(거짓 성공)이었다.
      // 가드는 그대로: 본인 소유(user_id)·approved 행만, .select() 로 실제 갱신 행수를 받는다.
      const { data: updated, error: updateError } = await serviceClient()
        .from('partners')
        .update({
          channel_name: channel.channelName,
          subscriber_count: channel.subscriberCount,
          avatar_url: channel.thumbnail,  // NULL이던 기존 파트너도 재연동 시 채워짐
          // ★ OAuth 토큰 미저장 — 재연동의 목적은 채널 정보 갱신이고, 그 값은
          // 위 fetchOwnChannel로 이미 다 받았다. 토큰은 여기서 버려진다.
        })
        .eq('id', ownedPartner.id)
        .eq('user_id', user.id)       // 본인 행 재확인 가드
        .eq('status', 'approved')     // approved 행만
        .select('id')
      // 갱신 실패(에러 또는 0행)면 "거짓 성공(?reconnected=1)"을 절대 내보내지 않는다.
      // GET 라우트라 throw(→500 깨진 화면) 대신 기존 에러 리다이렉트 패턴을 따른다.
      if (updateError || updated?.length !== 1) {
        return NextResponse.redirect(`${origin}${errorTarget}?error=reconnect_failed`)
      }
      // UPDATE 확정(0행 아님) 후에만 동의 로그 — 이렇게 해야 "partners 는 그대로인데
      // 로그만 남는" 불일치가 발생하지 않는다.
      await logConsent(supabase, {
        userId: user.id,
        partnerId: ownedPartner.id,
        channelId: channel.channelId,
        event: 'reconnect',
      })
      return NextResponse.redirect(`${origin}/partner/dashboard/settings?reconnected=1`)
    }
  }

  // 여기까지 왔다 = ownedPartner 미발견(재연동 대상 아님) = 신규 가입 흐름.
  // C-2 C단계 α: 즉시 가입 완료 대신, 증명된 채널을 핸드오프 쿠키에 담아 동의
  // 인터스티셜(/partner/apply/consent)로 보낸다. partners 생성/동의검증은 거기서.
  const pending: PendingChannel = {
    channelId: channel.channelId,
    channelName: channel.channelName,
    subscriberCount: channel.subscriberCount,
    thumbnail: channel.thumbnail,
  }
  const res = NextResponse.redirect(`${origin}/partner/apply/consent`)
  res.cookies.set(PENDING_CHANNEL_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_CHANNEL_MAX_AGE_SEC,
  })
  return res
}
