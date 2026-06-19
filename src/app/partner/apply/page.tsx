import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PENDING_CHANNEL_COOKIE, toPublicChannelInfo, type PendingChannel } from '@/lib/partnerPendingChannel'
import PartnerApplyForm from './PartnerApplyForm'

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const raw = cookieStore.get(PENDING_CHANNEL_COOKIE)?.value
  let channel: PendingChannel | null = null
  if (raw) {
    try {
      channel = JSON.parse(raw) as PendingChannel
    } catch {
      channel = null
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      <h1 className="text-xl font-bold mt-1 mb-1">유튜버 파트너 신청</h1>
      <p className="text-sm text-gray-500 mb-6">내 채널을 AI맵튜브 파트너로 등록해보세요.</p>

      <div className="mb-6 border rounded-lg p-4 bg-blue-50 text-sm space-y-1.5">
        <p className="font-bold mb-1">파트너 혜택</p>
        <p>📍 채널 전용 지도 페이지 생성 (maptube.ai/@채널명)</p>
        <p>📊 월간 트래픽 리포트 무료 제공</p>
        <p>🏆 파트너 배지 + 지도 우선 노출</p>
        <p>💰 초기 파트너 수익 공유 우대 조건</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error === 'youtube_denied' && 'YouTube 채널 연동이 취소되었습니다.'}
          {error === 'no_channel' && '연동한 Google 계정에 연결된 YouTube 채널을 찾을 수 없습니다.'}
          {error === 'youtube_failed' && 'YouTube 채널 연동에 실패했습니다. 다시 시도해주세요.'}
        </div>
      )}

      <PartnerApplyForm channel={channel ? toPublicChannelInfo(channel) : null} />
    </div>
  )
}
