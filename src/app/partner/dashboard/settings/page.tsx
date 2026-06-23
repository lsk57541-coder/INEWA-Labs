import Link from 'next/link'
import { getMyPartner } from '../actions'
import SettingsControls from './SettingsControls'

const GRADE_LABEL: Record<string, string> = { general: '일반', premium: '프리미엄' }

export default async function PartnerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reconnected?: string }>
}) {
  const { error, reconnected } = await searchParams
  const partner = await getMyPartner()

  return (
    <div>
      <Link href="/partner/dashboard" className="text-xs text-gray-400 hover:text-gray-600">← 대시보드</Link>
      <h1 className="text-xl font-bold mt-3 mb-6">설정</h1>

      {reconnected && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          채널 연동을 갱신했습니다.
        </div>
      )}
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error === 'youtube_denied' && 'YouTube 채널 연동이 취소되었습니다.'}
          {error === 'no_channel' && '연동한 Google 계정에 연결된 YouTube 채널을 찾을 수 없습니다.'}
          {error === 'youtube_failed' && 'YouTube 채널 연동에 실패했습니다. 다시 시도해주세요.'}
        </div>
      )}

      <div className="border rounded-lg p-4 mb-6">
        <p className="text-sm font-medium mb-2">YouTube 채널 연동</p>
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm mb-3">
          <span className="font-medium">✅ {partner.channel_name}</span>
          <span className="text-gray-500">
            구독자 {(partner.subscriber_count ?? 0).toLocaleString()}명
            {partner.grade && ` · ${GRADE_LABEL[partner.grade] ?? partner.grade} 등급`}
          </span>
        </div>
        <a
          href="/api/auth/youtube/start"
          className="inline-block text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          🔄 채널 연동 다시하기 (토큰 재발급)
        </a>
      </div>

      <SettingsControls initialOptIn={partner.monthly_report_opt_in} />
    </div>
  )
}
