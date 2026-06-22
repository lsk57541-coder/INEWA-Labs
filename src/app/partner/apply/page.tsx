import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PENDING_CHANNEL_COOKIE } from '@/lib/partnerPendingChannel'
import { completePartnerSignup } from './actions'

const ERROR_MESSAGE: Record<string, string> = {
  youtube_denied: 'YouTube 채널 연동이 취소되었습니다.',
  no_channel: '연동한 Google 계정에 연결된 YouTube 채널을 찾을 수 없습니다.',
  youtube_failed: 'YouTube 채널 연동에 실패했습니다. 다시 시도해주세요.',
  already_applied: '이미 등록된 채널입니다.',
}

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // YouTube OAuth가 끝나고 돌아오는 길이면, 입력 폼 없이 바로 가입을 마친다
  // (Outbound 채널은 outreach에서 이미 검증됐으므로 심사가 필요 없음).
  const cookieStore = await cookies()
  if (cookieStore.get(PENDING_CHANNEL_COOKIE)?.value) {
    await completePartnerSignup()
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 block text-left">← 메인으로</Link>
      <h1 className="text-xl font-bold mt-3 mb-1">유튜버 파트너 등록</h1>
      <p className="text-sm text-gray-500 mb-6">
        채널을 연동하면 영상 속 장소가 지도에 자동 노출되고, 월간 트래픽 리포트를 받아보실 수 있습니다.
      </p>

      {error && ERROR_MESSAGE[error] && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-left">
          {ERROR_MESSAGE[error]}
        </div>
      )}

      <a
        href="/api/auth/youtube/start"
        className="block text-center bg-red-600 text-white rounded-lg py-3.5 text-base font-medium hover:bg-red-700 transition"
      >
        ▶ YouTube 채널 연동하기
      </a>
      <p className="text-xs text-gray-400 mt-3 leading-relaxed">
        채널 연동 시 영상 자막 데이터를 장소 추출 목적으로<br />
        활용하며, 언제든 설정에서 연동을 해제할 수 있습니다.
      </p>
    </div>
  )
}
