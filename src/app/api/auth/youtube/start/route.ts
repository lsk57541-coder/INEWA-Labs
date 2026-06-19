import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { buildGoogleAuthUrl, OAUTH_STATE_COOKIE, OAUTH_REDIRECT_PATH } from '@/lib/googleOAuth'

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const state = randomUUID()
  const res = NextResponse.redirect(buildGoogleAuthUrl(`${origin}${OAUTH_REDIRECT_PATH}`, state))
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  return res
}
