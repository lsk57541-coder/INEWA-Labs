import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMyPartner } from '../actions'
import PlacesList from './PlacesList'

const TABS = [
  { key: '', label: '전체' },
  { key: 'active', label: '지도 표시 중' },
  { key: 'reviewing', label: '검토 중' },
  { key: 'rejected', label: '반려됨' },
  { key: 'hidden', label: '비공개' },
] as const

export default async function PartnerPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const partner = await getMyPartner()

  const supabase = await createClient()
  let query = supabase
    .from('places')
    .select('id, name, address, category, video_url, status, click_count, latitude, longitude, rejection_reason, verification_status, source, video_title')
    .eq('partner_id', partner.id)
    .neq('status', 'deleted')  // 소프트 삭제는 모든 탭(전체 포함)에서 제외 — 삭제했으니 목록에 안 보임.
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data } = await query
  // AI가 찾은 미검증 장소(source='ai' && unverified)를 위로 — 확인이 가장 필요한 것부터.
  // 그 외는 기존 최신순 유지(안정 정렬).
  const places = (data ?? []).slice().sort((a, b) => {
    const aTop = a.source === 'ai' && a.verification_status === 'unverified' ? 0 : 1
    const bTop = b.source === 'ai' && b.verification_status === 'unverified' ? 0 : 1
    return aTop - bTop
  })

  return (
    <div>
      <Link href="/partner/dashboard" className="text-xs text-gray-400 hover:text-gray-600">← 대시보드</Link>
      <h1 className="text-xl font-bold mt-3 mb-6">장소 관리</h1>

      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/partner/dashboard/places?status=${t.key}` : '/partner/dashboard/places'}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
              (status ?? '') === t.key
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <PlacesList places={places ?? []} />
    </div>
  )
}
