import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (errorParam) {
    console.error('[auth/callback] OAuth error:', errorParam, errorDescription)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}&desc=${encodeURIComponent(errorDescription ?? '')}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && session) {
      const user = session.user
      await supabase.from('profiles').upsert({
        id: user.id,
        nickname: user.user_metadata?.nickname ?? user.user_metadata?.name ?? '사용자',
        avatar_url: user.user_metadata?.avatar_url ?? null,
      }, { onConflict: 'id', ignoreDuplicates: true })
      return NextResponse.redirect(`${origin}/`)
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
