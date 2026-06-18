import Link from 'next/link'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; desc?: string }>
}) {
  const { error, desc } = await searchParams

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-gray-50">
      <h1 className="text-2xl font-bold">AI맵튜브</h1>
      <p className="text-gray-500">지도 위의 유튜브 영상 탐색 서비스</p>
      <KakaoLoginButton />
      <p className="text-xs text-gray-400">
        로그인 시{' '}
        <Link href="/terms" className="underline">이용약관</Link>
        {' '}및{' '}
        <Link href="/privacy" className="underline">개인정보처리방침</Link>
        에 동의하는 것으로 간주됩니다.
      </p>
      {error && (
        <div className="max-w-sm w-full bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 break-all">
          <p className="font-semibold mb-1">로그인 에러</p>
          <p>{error}</p>
          {desc && <p className="mt-1 text-red-500">{desc}</p>}
        </div>
      )}
    </div>
  )
}
