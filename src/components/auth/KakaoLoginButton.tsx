'use client'

import { createClient } from '@/lib/supabase/client'

interface KakaoLoginButtonProps {
  label?: string
  className?: string
  next?: string  // 로그인 후 복귀할 내부 경로(예: /partner/apply). 없으면 기존대로 홈.
}

export default function KakaoLoginButton({ label = '카카오로 시작하기', className = '', next }: KakaoLoginButtonProps) {
  const supabase = createClient()

  const handleLogin = async () => {
    // 복귀 경로를 단기 쿠키로 넘김(콜백이 read→가드→clear). redirectTo는 그대로 두어 화이트리스트 불변.
    // SameSite=Lax라 OAuth 왕복(top-level GET redirect)에서 쿠키가 콜백까지 전달됨. 내부경로만 방어 저장.
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) {
      const secure = location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `partner_return_to=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax${secure}`
    }
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: 'profile_nickname profile_image',
      },
    })
  }

  return (
    <button
      onClick={handleLogin}
      className={`flex items-center gap-2 bg-[#FEE500] text-[#191919] font-semibold px-5 py-3 rounded-lg hover:brightness-95 transition ${className}`}
    >
      <KakaoIcon />
      {label}
    </button>
  )
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 0C4.03 0 0 3.13 0 7c0 2.49 1.6 4.67 4 5.93L3.1 16.5c-.07.28.2.5.45.36L8 14.1c.33.03.66.05 1 .05 4.97 0 9-3.13 9-7S13.97 0 9 0z"
        fill="#191919"
      />
    </svg>
  )
}
