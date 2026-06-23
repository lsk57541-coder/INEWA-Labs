import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PlaceReviewList from './PlaceReviewList'

const TABS = [
  { key: '', label: '전체' },
  { key: 'reviewing', label: '검토 중' },
  { key: 'active', label: '승인됨' },
  { key: 'rejected', label: '반려됨' },
] as const

export default async function AdminPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  let query = supabase
    .from('places')
    .select('id, name, address, category, video_url, status, rejection_reason, created_at, partners(channel_name)')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data: places } = await query

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 관리자 홈</Link>
          <h1 className="text-xl font-bold mt-1">파트너 장소 검토</h1>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={t.key ? `/admin/places?status=${t.key}` : '/admin/places'}
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

      <PlaceReviewList places={(places ?? []) as unknown as Parameters<typeof PlaceReviewList>[0]['places']} />
    </div>
  )
}
