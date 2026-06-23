import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  deleteLocation,
  getAccuracyStats,
  getMinConfidenceSetting,
  setMinConfidenceSetting,
} from '@/app/actions'
import { PLACENAME_SOURCES } from '@/lib/placeNameSources'
import DeleteButton from '@/components/admin/DeleteButton'
import Link from 'next/link'

const SOURCE_LABEL: Record<string, string> = {
  explicit_description: '설명란 명시 (상호명: ○○)',
  title_match: '제목 기반 카카오 매칭',
  address_match: '주소 기반 카카오 매칭',
  comment_match: '댓글/답글 기반 매칭',
  address_fallback: '매칭 실패 → 주소 그대로(숨김 대상)',
  correction: '사용자 신고로 보정됨',
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: locations } = await supabase
    .from('locations')
    .select('*, videos(count)')
    .order('created_at', { ascending: false })

  const accuracyStats = await getAccuracyStats()
  const minConfidence = await getMinConfidenceSetting()

  const cutoffRank = PLACENAME_SOURCES.indexOf(minConfidence)
  const shownStats = accuracyStats.filter((s) => {
    const rank = PLACENAME_SOURCES.indexOf(s.source as typeof PLACENAME_SOURCES[number])
    return rank !== -1 && rank <= cutoffRank
  })
  const totalAll = accuracyStats.reduce((sum, s) => sum + s.total, 0)
  const totalShown = shownStats.reduce((sum, s) => sum + s.total, 0)
  const reportedShown = shownStats.reduce((sum, s) => sum + s.reported, 0)
  const exposureRate = totalAll > 0 ? (totalShown / totalAll) * 100 : null
  const estimatedAccuracy = totalShown > 0 ? (1 - reportedShown / totalShown) * 100 : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
          <h1 className="text-xl font-bold mt-1">장소 관리</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/partners"
            className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            파트너 신청 관리
          </Link>
          <Link
            href="/admin/places"
            className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            파트너 장소 검토
          </Link>
          <Link
            href="/admin/outreach"
            className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            콜드 아웃리치
          </Link>
          <Link
            href="/admin/locations/new/bulk"
            className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            영상으로 일괄 등록
          </Link>
          <Link
            href="/admin/locations/new"
            className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition"
          >
            + 장소 추가
          </Link>
        </div>
      </div>

      <div className="mb-8 border rounded-lg overflow-hidden">
        <p className="text-sm font-bold px-4 py-2 bg-gray-50 border-b">노출 기준 (정확도 관리)</p>
        <form action={setMinConfidenceSetting} className="flex items-center gap-2 px-4 py-3 border-b">
          <label className="text-xs text-gray-500 shrink-0">최소 노출 기준</label>
          <select
            name="source"
            defaultValue={minConfidence}
            className="flex-1 text-sm border rounded-lg px-2 py-1.5 bg-white"
          >
            {PLACENAME_SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
            ))}
          </select>
          <button
            type="submit"
            className="shrink-0 text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition"
          >
            저장
          </button>
        </form>
        <div className="px-4 py-3 text-xs text-gray-500 flex gap-4">
          <p>
            노출률{' '}
            <span className="font-medium text-gray-700">
              {exposureRate !== null ? `${exposureRate.toFixed(1)}%` : '-'}
            </span>
          </p>
          <p>
            추정 정확도{' '}
            <span className="font-medium text-gray-700">
              {estimatedAccuracy !== null ? `${estimatedAccuracy.toFixed(1)}%` : '-'}
            </span>
          </p>
        </div>
        <p className="px-4 pb-3 text-xs text-gray-400">
          기준보다 신뢰도 낮은 영상은 검색결과에서 숨겨집니다. 추정 정확도가 80~90% 이상이 될 때까지 기준을 올려보세요.
        </p>
      </div>

      {accuracyStats.length > 0 && (
        <div className="mb-8 border rounded-lg overflow-hidden">
          <p className="text-sm font-bold px-4 py-2 bg-gray-50 border-b">장소명 정확도 (방식별 신고율)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 text-left">
                <th className="px-4 py-2">해석 방식</th>
                <th className="px-4 py-2 text-right">건수</th>
                <th className="px-4 py-2 text-right">신고됨</th>
                <th className="px-4 py-2 text-right">신고율</th>
              </tr>
            </thead>
            <tbody>
              {accuracyStats.map((s) => (
                <tr key={s.source} className="border-t">
                  <td className="px-4 py-2">{SOURCE_LABEL[s.source] ?? s.source}</td>
                  <td className="px-4 py-2 text-right">{s.total}</td>
                  <td className="px-4 py-2 text-right">{s.reported}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {s.total > 0 ? `${((s.reported / s.total) * 100).toFixed(1)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locations || locations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>등록된 장소가 없습니다</p>
          <p className="text-sm mt-1">장소를 추가해서 영상을 연결해보세요</p>
        </div>
      ) : (
        <ul className="divide-y border rounded-lg overflow-hidden">
          {locations.map((loc) => {
            const videoCount = (loc.videos as { count: number }[])?.[0]?.count ?? 0
            return (
              <li key={loc.id} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50">
                <div>
                  <p className="font-medium text-sm">{loc.name}</p>
                  <p className="text-xs text-gray-400">{loc.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    위도 {loc.lat} · 경도 {loc.lng} · 영상 {videoCount}개
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Link
                    href={`/admin/locations/${loc.id}`}
                    className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded transition"
                  >
                    영상 관리
                  </Link>
                  <DeleteButton
                    action={deleteLocation.bind(null, loc.id)}
                    confirm={`"${loc.name}" 장소를 삭제할까요?`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
