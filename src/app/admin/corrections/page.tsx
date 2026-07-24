import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { selectAllPaged } from '@/lib/supabasePaging'
import AdminTabNav from '@/components/admin/AdminTabNav'
import CorrectionReviewList from './CorrectionReviewList'

// wrong_address 신고 중 아직 관리자 결정(승인/기각)이 없는 건 = pending.
// ★조회 순서: (1) 세션 클라이언트로 관리자 권한 검증 → (2) 통과 후에만 service_role 생성·조회.
//   decisions 테이블은 RLS 정책 0개라 service_role만 읽을 수 있다(P0-4A).
export default async function AdminCorrectionsPage() {
  // (1) 관리자 검증 — 실패 시 service_role 코드에 도달하지 않고 즉시 리다이렉트
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  // (2) 통과 후 service_role (서버 전용, 브라우저로 안 나감)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let items: Parameters<typeof CorrectionReviewList>[0]['items'] = []
  let loadError: string | null = null

  if (!url || !serviceKey) {
    loadError = '서버 설정 오류(SUPABASE_SERVICE_ROLE_KEY 미설정)로 목록을 불러올 수 없어요.'
  } else {
    const admin = createServiceClient(url, serviceKey)

    // 최소 필드만 — ★user_id·이메일 등 개인정보 미조회.
    const reports = await selectAllPaged('adminCorrections.reports', (from, to) =>
      admin.from('location_reports')
        .select('id, video_id, lat, lng, suggested_address, created_at')
        .eq('reason', 'wrong_address')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    )
    const decisions = await selectAllPaged('adminCorrections.decisions', (from, to) =>
      admin.from('location_correction_decisions')
        .select('location_report_id')
        .order('id', { ascending: true })
        .range(from, to)
    )
    const corrections = await selectAllPaged('adminCorrections.corrections', (from, to) =>
      admin.from('location_corrections')
        .select('video_id, lat, lng, address, place_name')
        .order('id', { ascending: true })
        .range(from, to)
    )

    const decidedReportIds = new Set(
      (decisions as { location_report_id: string | null }[]).map((d) => d.location_report_id).filter(Boolean) as string[]
    )
    type Corr = { video_id: string; lat: number; lng: number; address: string | null; place_name: string | null }
    const corrByVideo = new Map((corrections as Corr[]).map((c) => [c.video_id, c]))

    type Rep = { id: string; video_id: string; lat: number; lng: number; suggested_address: string | null; created_at: string }
    const pending = (reports as Rep[]).filter((r) => !decidedReportIds.has(r.id))

    const pendingCountByVideo = new Map<string, number>()
    for (const r of pending) pendingCountByVideo.set(r.video_id, (pendingCountByVideo.get(r.video_id) ?? 0) + 1)

    items = pending.map((r) => {
      const active = corrByVideo.get(r.video_id)
      return {
        reportId: r.id,
        videoId: r.video_id,
        reportLat: r.lat,
        reportLng: r.lng,
        suggestedAddress: r.suggested_address,
        createdAt: r.created_at,
        activeCorrection: active
          ? { lat: active.lat, lng: active.lng, address: active.address, placeName: active.place_name }
          : null,
        otherPendingCount: (pendingCountByVideo.get(r.video_id) ?? 1) - 1,
      }
    })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-3">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      </div>
      <AdminTabNav active="위치보정" />

      <p className="text-xs text-gray-400 mb-4">
        주소 오류 신고 중 아직 처리하지 않은 건이에요. 승인하면 그 영상의 지도 위치가 교체되고, 기각하면 현재 위치가 유지돼요.
      </p>

      {loadError
        ? <p className="text-sm text-red-600">{loadError}</p>
        : <CorrectionReviewList items={items} />}
    </div>
  )
}
