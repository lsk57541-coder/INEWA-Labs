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
    .select('id, name, address, category, video_url, status, click_count, rejection_reason')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data: places } = await query

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
