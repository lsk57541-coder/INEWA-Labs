'use client'

import { createClient } from '@/lib/supabase/client'
import { YOUTUBE_OAUTH_SCOPE } from '@/lib/googleOAuth'

// 파트너 전용 구글 로그인 버튼. 소비자용 KakaoLoginButton은 건드리지 않는다.
// 구글 로그인 1회로 Supabase 세션 + youtube.readonly provider_token 을 받아,
// 전용 콜백(/partner/apply/callback)에서 채널 소유권 증명 + 파트너 가입까지 한 번에 끝낸다.
interface GooglePartnerLoginButtonProps {
  label?: string
  className?: string
}

export default function GooglePartnerLoginButton({
  label = '▶ YouTube 채널 연동하기',
  className = '',
}: GooglePartnerLoginButtonProps) {
  const supabase = createClient()

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // ★ 전용 콜백 — 소비자 카카오 공유 콜백(/auth/callback)을 타지 않는다.
        redirectTo: `${location.origin}/partner/apply/callback`,
        // provider_token 을 youtube.readonly 로 받기 위한 추가 스코프(googleOAuth.ts 단일 출처 상수).
        scopes: YOUTUBE_OAUTH_SCOPE,
        // refresh_token 까지 받기 위해 offline + 매번 동의창.
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    // 성공 시 구글로 top-level 리다이렉트되므로 이 아래는 실행되지 않는다.
  }

  return (
    <button
      onClick={handleLogin}
      className={`block w-full text-center bg-red-600 text-white rounded-lg py-3.5 text-base font-semibold hover:bg-red-700 transition ${className}`}
    >
      {label}
    </button>
  )
}
