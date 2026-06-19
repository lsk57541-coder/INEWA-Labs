import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
}

export default async function PartnerApplyCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: partner } = await supabase
    .from('partners')
    .select('channel_name, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!partner) redirect('/partner/apply')

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <p className="text-4xl mb-3">📨</p>
      <h1 className="text-xl font-bold mb-2">신청이 접수되었습니다</h1>
      <p className="text-sm text-gray-500 mb-6">
        <strong>{partner.channel_name}</strong> 채널의 파트너 신청 상태:{' '}
        <span className="font-semibold text-blue-600">{STATUS_LABEL[partner.status] ?? partner.status}</span>
      </p>

      <div className="border rounded-lg p-4 bg-gray-50 text-sm text-left space-y-1.5 mb-6">
        <p>⏱ 예상 심사 기간: 영업일 기준 3~5일</p>
        <p>📩 문의: inewalabs@gmail.com</p>
      </div>

      <div className="border rounded-lg p-4 bg-blue-50 text-sm text-left space-y-1.5 mb-6">
        <p className="font-bold mb-1">승인 시 받게 될 혜택</p>
        <p>📍 채널 전용 지도 페이지 생성 (maptube.ai/@채널명)</p>
        <p>📊 월간 트래픽 리포트 무료 제공</p>
        <p>🏆 파트너 배지 + 지도 우선 노출</p>
        <p>💰 초기 파트너 수익 공유 우대 조건</p>
      </div>

      <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 font-medium">← 메인으로 돌아가기</Link>
    </div>
  )
}
