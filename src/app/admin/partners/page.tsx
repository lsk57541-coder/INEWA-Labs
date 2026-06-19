import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getPartnerApplications,
  approvePartnerApplication,
  rejectPartnerApplication,
} from '@/app/actions'
import PartnerActionButtons from '@/components/admin/PartnerActionButtons'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
}

export default async function AdminPartnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const partners = await getPartnerApplications()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 관리자 메인</Link>
      <h1 className="text-xl font-bold mt-1 mb-6">파트너 신청 관리</h1>

      {partners.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>신청된 파트너가 없습니다</p>
        </div>
      ) : (
        <ul className="divide-y border rounded-lg overflow-hidden">
          {partners.map((p) => (
            <li key={p.id} className="flex items-start justify-between p-4 bg-white gap-3">
              <div className="overflow-hidden">
                <p className="font-medium text-sm truncate">{p.channel_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  구독자 {(p.subscriber_count ?? 0).toLocaleString()}명 · {p.region} · {p.categories.join(', ')}
                </p>
                <p className="text-xs mt-1 font-medium text-blue-600">{STATUS_LABEL[p.status] ?? p.status}</p>
              </div>
              {p.status === 'pending' && (
                <PartnerActionButtons
                  onApprove={approvePartnerApplication.bind(null, p.id)}
                  onReject={rejectPartnerApplication.bind(null, p.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
