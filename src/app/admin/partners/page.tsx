import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPartnerApplications } from '@/app/actions'
import PartnerStats from './components/PartnerStats'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
}

const TABS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '심사중' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '거절' },
] as const

export default async function AdminPartnersPage({
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

  const allPartners = await getPartnerApplications()
  const filtered = status ? allPartners.filter((p) => p.status === status) : allPartners

  const now = new Date()
  const thisMonthCount = allPartners.filter((p) => {
    const d = new Date(p.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const pendingCount = allPartners.filter((p) => p.status === 'pending').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 관리자 메인</Link>
      <h1 className="text-xl font-bold mt-1 mb-6">파트너 신청 관리</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{allPartners.length}</p>
          <p className="text-xs text-gray-400 mt-1">총 파트너 수</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{thisMonthCount}</p>
          <p className="text-xs text-gray-400 mt-1">이번달 신규</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{pendingCount}</p>
          <p className="text-xs text-gray-400 mt-1">심사대기</p>
        </div>
      </div>

      <PartnerStats partners={allPartners} />

      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/admin/partners?status=${t.key}` : '/admin/partners'}
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>신청된 파트너가 없습니다</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 text-left bg-gray-50">
                <th className="px-3 py-2">채널명</th>
                <th className="px-3 py-2 text-right">구독자 수</th>
                <th className="px-3 py-2">카테고리</th>
                <th className="px-3 py-2">지역</th>
                <th className="px-3 py-2">신청일</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">
                    <a
                      href={`https://www.youtube.com/channel/${p.channel_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {p.channel_name}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right">{(p.subscriber_count ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2">{p.categories.join(', ')}</td>
                  <td className="px-3 py-2">{p.region}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[p.status] ?? p.status}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/partners/${p.id}`} className="text-xs text-gray-500 hover:text-gray-700 underline">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
