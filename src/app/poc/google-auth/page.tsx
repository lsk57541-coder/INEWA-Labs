'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── 파트너 구글 단독인증 격리 PoC (라이브 인증 흐름과 완전 분리된 /poc 전용) ──
// 목표: 구글 로그인 "1회"로 Supabase 세션 + youtube.readonly provider_token +
// 채널 소유권 증명이 한 번에 성립하는지 실증한다.
// 이 화면은 라이브 로그인(KakaoLoginButton)·미들웨어 가드·profiles/partners 를
// 전혀 건드리지 않는다. 결과 판정은 /poc/google-auth/callback 에서 표시된다.

// googleOAuth.ts 의 YOUTUBE_OAUTH_SCOPE 와 동일한 값 (클라/서버 번들 경계라 로컬 상수로 둠).
const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

export default function PocGoogleAuthPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // ★ 전용 콜백 — 공유 /auth/callback 을 타지 않는다.
        redirectTo: `${location.origin}/poc/google-auth/callback`,
        // provider_token 을 youtube.readonly 로 받기 위한 추가 스코프.
        scopes: YOUTUBE_READONLY_SCOPE,
        // refresh_token 까지 받아보기 위해 offline + 매번 동의창.
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    // 성공 시 구글로 top-level 리다이렉트되므로 이 아래는 실행되지 않는다.
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Isolated PoC · 라이브 무영향
        </p>
        <h1 className="mt-2 text-xl font-bold text-neutral-900">
          파트너 구글 단독인증 실증
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          구글 로그인 1회로 <strong>Supabase 세션 + youtube.readonly
          provider_token + 채널 소유권 증명</strong>이 한 번에 성립하는지
          확인하는 격리 테스트입니다. 라이브 카카오/파트너 인증에는 영향을 주지
          않습니다.
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-3 font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? '구글로 이동 중…' : '구글 계정으로 로그인 (PoC)'}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            로그인 시작 실패: {error}
          </p>
        )}

        <ol className="mt-6 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-neutral-500">
          <li>시크릿/새 브라우저(내 카카오 세션과 분리)로 접속</li>
          <li>기존 카카오와 <strong>다른 이메일</strong>의 테스트 구글 계정으로 로그인</li>
          <li>동의창에서 youtube.readonly 권한 동의</li>
          <li>콜백 화면의 판정 결과 확인 후, Supabase Users에서 해당 유저 삭제</li>
        </ol>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
