import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  fetchOwnChannel,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_PATH,
} from '@/lib/googleOAuth'
import { PENDING_CHANNEL_COOKIE, PENDING_CHANNEL_MAX_AGE_SEC, type PendingChannel } from '@/lib/partnerPendingChannel'
import { createClient } from '@/lib/supabase/server'

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
  // place instead of routing through the application flow again.
  if (user) {
    const { data: ownedPartner } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', user.id)
      .eq('channel_id', channel.channelId)
      .maybeSingle()
    if (ownedPartner) {
      await supabase
        .from('partners')
        .update({
          channel_name: channel.channelName,
          subscriber_count: channel.subscriberCount,
          youtube_access_token: tokens.access_token,
          youtube_refresh_token: tokens.refresh_token ?? null,
        })
        .eq('id', ownedPartner.id)
      return NextResponse.redirect(`${origin}/partner/dashboard/settings?reconnected=1`)
    }
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
