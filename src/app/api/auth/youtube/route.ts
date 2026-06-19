import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  fetchOwnChannel,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_PATH,
} from '@/lib/googleOAuth'
import { PENDING_CHANNEL_COOKIE, PENDING_CHANNEL_MAX_AGE_SEC, type PendingChannel } from '@/lib/partnerPendingChannel'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value
  cookieStore.delete(OAUTH_STATE_COOKIE)

  if (errorParam) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_denied`)
  }
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_failed`)
  }

  const tokens = await exchangeCodeForTokens(code, `${origin}${OAUTH_REDIRECT_PATH}`)
  if (!tokens) {
    return NextResponse.redirect(`${origin}/partner/apply?error=youtube_failed`)
  }

  const channel = await fetchOwnChannel(tokens.access_token)
  if (!channel) {
    return NextResponse.redirect(`${origin}/partner/apply?error=no_channel`)
  }

  const pending: PendingChannel = {
    channelId: channel.channelId,
    channelName: channel.channelName,
    subscriberCount: channel.subscriberCount,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
  }

  const res = NextResponse.redirect(`${origin}/partner/apply`)
  res.cookies.set(PENDING_CHANNEL_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PENDING_CHANNEL_MAX_AGE_SEC,
    path: '/',
  })
  return res
}
