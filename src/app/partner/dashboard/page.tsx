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
      <h1 className="text-xl font-bold mb-1">{partner.channel_name}</h1>
      <p className="text-sm text-gray-500 mb-6">파트너 대시보드</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-bold">{stats.activePlaceCount}</p>
          <p className="text-xs text-gray-400 mt-1">이번 달 지도 표시 장소 수</p>
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

      <Link
        href="/"
        className="block text-center bg-black text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-800 transition"
      >
        내 채널 지도 보기
      </Link>
    </div>
  )
}
