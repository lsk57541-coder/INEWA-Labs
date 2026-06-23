'use client'

import { createClient } from '@/lib/supabase/client'

interface KakaoLoginButtonProps {
  label?: string
  className?: string
}

export default function KakaoLoginButton({ label = '카카오로 시작하기', className = '' }: KakaoLoginButtonProps) {
  const supabase = createClient()

  const handleLogin = async () => {
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
