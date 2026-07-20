import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOwnChannel } from '@/lib/googleOAuth'
import {
  PENDING_CHANNEL_COOKIE,
  PENDING_CHANNEL_MAX_AGE_SEC,
  type PendingChannel,
} from '@/lib/partnerPendingChannel'

// ── 파트너 구글 단독인증 전용 콜백 (A모델) ──
// ★ 소비자 카카오 공유 콜백(src/app/auth/callback/route.ts)을 절대 타지 않는다.
// 흐름(1차 PoC에서 검증됨): exchangeCodeForSession → session.provider_token →
//   fetchOwnChannel(mine=true) 채널 소유권 증명 → completePartnerSignup(무수정 재사용).
// completePartnerSignup 은 내부에서 partners upsert + redirect('/partner/dashboard') 까지 수행하며,
// 이 "route handler에서 곧바로 completePartnerSignup 호출" 패턴은 기존 /api/auth/youtube 콜백과 동일하다.
// 에러 키는 /partner/apply 의 ERROR_MESSAGE 맵을 그대로 재사용한다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')

  // 구글 동의창에서 취소/거부
  if (errorParam) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_denied`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_failed`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_failed`)
  }

  // provider_token 은 이 콜백 "그 순간"의 세션에만 실려온다.
  const providerToken = data.session.provider_token
  if (!providerToken) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_failed`)
  }

  const channel = await fetchOwnChannel(providerToken)
  if (!channel) {
    // 로그인(세션) 자체는 성립했으므로 세션은 남겨두고, 채널만 못 찾았다고 안내.
    return NextResponse.redirect(`${origin}/partner/apply?error=no_channel`)
  }

  // 증명이 끝난 채널 정보만 PendingChannel 로 넘긴다 — providerToken 은 위
  // fetchOwnChannel 로 용도가 완결됐으므로 여기서 버려진다(저장·전달 안 함).
  const pending: PendingChannel = {
    channelId: channel.channelId,
    channelName: channel.channelName,
    subscriberCount: channel.subscriberCount,
    thumbnail: channel.thumbnail,
  }

  // C-2 C단계 α: 즉시 completePartnerSignup 대신, 증명된 채널을 핸드오프 쿠키에 담아
  // 동의 인터스티셜(/partner/apply/consent)로 보낸다. 실제 partners 생성/동의검증은 거기서.
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
