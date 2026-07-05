import Link from 'next/link'
import { getMyPartner, getDashboardStats } from './actions'

// 전월 대비 증감 표기. 첫 달(previous=0)은 '신규', 이번 달 실적 0은 중립 '–'로
// '+100%/-100%' 오해(신규인데 폭증처럼·실적0인데 폭락처럼)를 피한다.
function changeRate(current: number, previous: number): string {
  if (current === 0) return '–'
  if (previous === 0) return '신규'
  const rate = ((current - previous) / previous) * 100
  return `전월 대비 ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`
}

function MapPinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function CoverageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="7" y1="3" x2="7" y2="21" />
      <line x1="17" y1="3" x2="17" y2="21" />
      <line x1="2" y1="9" x2="7" y2="9" />
      <line x1="2" y1="15" x2="7" y2="15" />
      <line x1="17" y1="9" x2="22" y2="9" />
      <line x1="17" y1="15" x2="22" y2="15" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default async function PartnerDashboardPage() {
  const partner = await getMyPartner()
  const stats = await getDashboardStats(partner.id)
  const isConnected = !!partner.channel_id

  return (
    <div>
      {/* 채널 연동 상태 카드 */}
      <div className="border rounded-lg p-4 mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{partner.channel_name}</p>
          {isConnected ? (
            <p className="text-xs text-gray-400 mt-0.5">
              구독자 {(partner.subscriber_count ?? 0).toLocaleString()}명 · <span className="text-green-600">연동됨 ✓</span>
            </p>
          ) : (
            <p className="text-xs text-red-500 mt-0.5">채널 재연동 필요</p>
          )}
        </div>
        {!isConnected && (
          <a
            href="/api/auth/youtube/start"
            className="text-xs bg-black text-white rounded-lg px-3 py-1.5 hover:bg-gray-800 transition shrink-0"
          >
            재연동
          </a>
        )}
      </div>

      {/* CTA */}
      <Link
        href="/partner/dashboard/places/extract"
        className="block text-center text-white rounded-lg py-3.5 text-sm font-medium hover:opacity-90 transition mb-1.5"
        style={{ backgroundColor: '#0F1C2E' }}
      >
        영상으로 장소 등록하기
      </Link>
      <p className="text-xs text-gray-400 text-center mb-6">YouTube URL을 입력하면 AI가 장소를 자동 추출해요</p>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border rounded-lg p-4">
          {stats.activePlaceCount === 0 ? (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1.5">이번 달 지도 표시 장소</p>
              <Link href="/partner/dashboard/places/extract" className="text-xs text-blue-600 leading-relaxed hover:underline">
                아직 등록된 장소가 없어요<br />영상으로 장소를 등록해보세요 →
              </Link>
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold">{stats.activePlaceCount}</p>
              <p className="text-xs text-gray-400 mt-1">이번 달 지도 표시 장소</p>
              <p className="text-xs text-blue-600 mt-1 font-medium">
                {changeRate(stats.activePlaceCount, stats.activePlaceCountLastMonth)}
              </p>
            </>
          )}
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-bold">{stats.clicksThisMonth.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">이번 달 지도 클릭 수</p>
          <p className="text-xs text-blue-600 mt-1 font-medium">
            {changeRate(stats.clicksThisMonth, stats.clicksLastMonth)}
          </p>
        </div>
      </div>

      {/* 네비 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/partner/dashboard/coverage"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex items-start gap-3"
        >
          <span className="text-gray-500 shrink-0 mt-0.5"><CoverageIcon /></span>
          <div>
            <p className="text-sm font-medium">영상 커버리지</p>
            <p className="text-xs text-gray-400 mt-1">영상별 장소·노출 상태 확인</p>
          </div>
        </Link>
        <Link
          href="/partner/dashboard/places"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex items-start gap-3"
        >
          <span className="text-gray-500 shrink-0 mt-0.5"><MapPinIcon /></span>
          <div>
            <p className="text-sm font-medium">장소 관리</p>
            <p className="text-xs text-gray-400 mt-1">등록 장소 확인 및 수정</p>
          </div>
        </Link>
        <Link
          href="/partner/dashboard/settings"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex items-start gap-3"
        >
          <span className="text-gray-500 shrink-0 mt-0.5"><SettingsIcon /></span>
          <div>
            <p className="text-sm font-medium">설정</p>
            <p className="text-xs text-gray-400 mt-1">채널 연동 및 알림 설정</p>
          </div>
        </Link>
      </div>

      {/* 활용 가이드 (PDF) */}
      <div className="border rounded-lg p-4 mt-3">
        <p className="text-sm font-medium">📄 활용 가이드 (PDF)</p>
        <p className="text-xs text-gray-400 mt-1">파트너 기능 사용법을 담았어요</p>
        <div className="flex gap-2 mt-3">
          <a
            href="/partner-guide.pdf"
            target="_blank"
            rel="noopener"
            className="flex-1 text-center text-xs border border-gray-300 text-gray-700 rounded-lg py-2 hover:bg-gray-50 transition"
          >
            바로 보기
          </a>
          <a
            href="/partner-guide.pdf"
            download
            className="flex-1 text-center text-xs border border-gray-300 text-gray-700 rounded-lg py-2 hover:bg-gray-50 transition"
          >
            다운로드
          </a>
        </div>
      </div>
    </div>
  )
}
