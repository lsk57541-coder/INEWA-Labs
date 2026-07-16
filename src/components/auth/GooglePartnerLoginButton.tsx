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
        // ★ access_type: 'offline' 없음 = 구글이 provider_refresh_token을 발급하지 않는다.
        // 채널 소유권 증명은 provider_token(access) 하나로 끝나므로 요청할 근거가 없다(최소수집).
        // Supabase 세션 갱신은 구글 토큰이 아니라 Supabase 자체 refresh token으로 도므로 무영향.
        // prompt: 'consent'는 동의 로그가 실제 동의 시점과 일치하도록 유지.
        queryParams: {
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
