import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PartnerReviewForm from '@/components/admin/PartnerReviewForm'
import { approvePartner, rejectPartner } from './actions'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
}
const GRADE_LABEL: Record<string, string> = { general: '일반', premium: '프리미엄' }

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: partner } = await supabase
    .from('partners')
    .select('id, channel_id, channel_name, subscriber_count, categories, region, status, grade, rejection_reason, created_at')
    .eq('id', id)
    .single()
  if (!partner) redirect('/admin/partners')

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/admin/partners" className="text-xs text-gray-400 hover:text-gray-600">← 파트너 목록</Link>
      <h1 className="text-xl font-bold mt-1 mb-6">{partner.channel_name}</h1>

      <div className="border rounded-lg p-4 mb-6 text-sm space-y-1.5">
        <p>
          <a
            href={`https://www.youtube.com/channel/${partner.channel_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            YouTube 채널 열기 ↗
          </a>
        </p>
        <p>구독자 {(partner.subscriber_count ?? 0).toLocaleString()}명</p>
        <p>카테고리: {partner.categories?.length ? partner.categories.join(', ') : '-'}</p>
        <p>활동 지역: {partner.region ?? '-'}</p>
        <p>신청일: {new Date(partner.created_at).toLocaleDateString('ko-KR')}</p>
        <p>
          상태: <span className="font-semibold">{STATUS_LABEL[partner.status] ?? partner.status}</span>
          {partner.grade && <> · 등급: {GRADE_LABEL[partner.grade] ?? partner.grade}</>}
        </p>
        {partner.rejection_reason && (
          <p className="text-gray-500">거절 사유: {partner.rejection_reason}</p>
        )}
      </div>

      {partner.status === 'pending' ? (
        <PartnerReviewForm
          approveAction={approvePartner.bind(null, partner.id)}
          rejectAction={rejectPartner.bind(null, partner.id)}
        />
      ) : (
        <p className="text-sm text-gray-400">이미 심사가 완료된 신청입니다.</p>
      )}
    </div>
  )
}
