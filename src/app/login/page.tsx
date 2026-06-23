import Link from 'next/link'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; desc?: string }>
}) {
  const { error, desc } = await searchParams

  const errorMessage = error
    ? (desc?.trim() || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="w-full max-w-sm">

        {/* 브랜드 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">MAPTUBE</h1>
          <p className="text-sm text-muted">유튜버가 다녀온 그곳, 지도에서 바로 찾아보세요</p>
        </div>

        {/* 에러 메시지 */}
        {errorMessage && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {errorMessage}
          </div>
        )}

        {/* 로그인 혜택 */}
        <div className="border rounded-lg p-4 mb-6 space-y-2.5">
          <p className="text-xs font-medium text-gray-500 mb-3">로그인하면 이런 게 가능해요</p>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <HeartIcon />
            관심 장소 저장
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <FlagIcon />
            가본 곳 기록
          </div>
        </div>

        {/* 카카오 로그인 */}
        <KakaoLoginButton
          label="카카오 1초 로그인"
          className="w-full justify-center"
        />

        <Link
          href="/"
          className="block text-center text-xs text-muted hover:text-gray-600 transition mt-4"
        >
          로그인 없이 둘러보기 →
        </Link>

        {/* 약관 */}
        <div className="flex justify-center gap-4 mt-10 text-xs text-muted">
          <Link href="/terms" className="hover:text-gray-600">이용약관</Link>
          <Link href="/privacy" className="hover:text-gray-600">개인정보처리방침</Link>
        </div>

      </div>
    </div>
  )
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}
