import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// open-redirect 가드(신뢰 경계) — 쿠키값은 조작 가능하니 반드시 통과시킨다.
// 내부 절대경로만 허용: "/"로 시작(http(s):// 거부) + "//"·"/\"(프로토콜-상대/우회) 차단.
function safeInternalPath(next: string | null): string | null {
  if (!next || !next.startsWith('/')) return null
  if (next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}

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
      // 성공 후 목적지만 변경: 복귀 쿠키를 읽어 가드 통과 시 그리로, 없으면/이상값이면 기존대로 홈.
      // 쿠키는 즉시 삭제(다음 로그인에 안 남게). 세션 교환·profiles upsert 로직은 위에서 이미 끝났고 무수정.
      const cookieStore = await cookies()
      const rawNext = cookieStore.get('partner_return_to')?.value ?? null
      cookieStore.delete('partner_return_to')
      // malformed 쿠키(잘못된 %인코딩)가 로그인을 깨지 않게 decode 실패 시 null → '/' 폴백.
      let decodedNext: string | null = null
      try { decodedNext = rawNext ? decodeURIComponent(rawNext) : null } catch { decodedNext = null }
      const dest = safeInternalPath(decodedNext) ?? '/'
      return NextResponse.redirect(`${origin}${dest}`)
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? 'unknown')}`
    )
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
