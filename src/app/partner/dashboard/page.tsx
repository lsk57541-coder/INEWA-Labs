import Link from 'next/link'
import { getMyPartner, getDashboardStats } from './actions'

function changeRate(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%'
  const rate = ((current - previous) / previous) * 100
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`
}

export default async function PartnerDashboardPage() {
  const partner = await getMyPartner()
  const stats = await getDashboardStats(partner.id)

  return (
    <div>
      <h1 className="text-xl font-bold mb-0.5">{partner.channel_name}</h1>
      <p className="text-sm text-gray-400 mb-6">파트너 대시보드</p>

      <Link
        href="/partner/dashboard/places/extract"
        className="block text-center bg-black text-white rounded-lg py-3.5 text-sm font-medium hover:bg-gray-800 transition mb-6"
      >
        영상으로 장소 등록하기
      </Link>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-bold">{stats.activePlaceCount}</p>
          <p className="text-xs text-gray-400 mt-1">이번 달 지도 표시 장소</p>
          <p className="text-xs text-blue-600 mt-1 font-medium">
            전월 대비 {changeRate(stats.activePlaceCount, stats.activePlaceCountLastMonth)}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-bold">{stats.clicksThisMonth.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">이번 달 지도 클릭 수</p>
          <p className="text-xs text-blue-600 mt-1 font-medium">
            전월 대비 {changeRate(stats.clicksThisMonth, stats.clicksLastMonth)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/partner/dashboard/places"
          className="border rounded-lg p-4 hover:bg-gray-50 transition"
        >
          <p className="text-sm font-medium">장소 관리</p>
          <p className="text-xs text-gray-400 mt-1">등록 장소 확인 및 수정</p>
        </Link>
        <Link
          href="/partner/dashboard/settings"
          className="border rounded-lg p-4 hover:bg-gray-50 transition"
        >
          <p className="text-sm font-medium">설정</p>
          <p className="text-xs text-gray-400 mt-1">채널 연동 및 알림 설정</p>
        </Link>
      </div>
    </div>
  )
}
