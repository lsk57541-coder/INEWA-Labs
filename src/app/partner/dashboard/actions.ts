'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hidePartnerPlaces } from '@/lib/partnerPlaces'

export interface MyPartner {
  id: string
  channel_id: string
  channel_name: string
  subscriber_count: number | null
  grade: string | null
  status: string
  monthly_report_opt_in: boolean
}

// Shared by every /partner/dashboard/* page — the middleware already
// guarantees an approved partner row exists for the current user, this
// just fetches it.
export async function getMyPartner(): Promise<MyPartner> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('partners')
    .select('id, channel_id, channel_name, subscriber_count, grade, status, monthly_report_opt_in')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (error || !data) throw new Error('파트너 정보를 찾을 수 없습니다.')
  return data
}

export interface DashboardStats {
  activePlaceCount: number
  activePlaceCountLastMonth: number
  clicksThisMonth: number
  clicksLastMonth: number
}

function monthBoundaries() {
  const now = new Date()
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { startThisMonth, startLastMonth }
}

export async function getDashboardStats(partnerId: string): Promise<DashboardStats> {
  const supabase = await createClient()
  const { startThisMonth, startLastMonth } = monthBoundaries()

  const [activeNow, activeLastMonthEnd, clicksThis, clicksLast] = await Promise.all([
    supabase.from('places').select('id', { count: 'exact', head: true })
      .eq('partner_id', partnerId).eq('status', 'active'),
    // Approximates "active as of end of last month" — places don't keep a
    // status-change history, so this counts places that already existed by
    // then and are still active now.
    supabase.from('places').select('id', { count: 'exact', head: true })
      .eq('partner_id', partnerId).eq('status', 'active').lt('created_at', startThisMonth.toISOString()),
    supabase.from('place_clicks').select('id, places!inner(partner_id)', { count: 'exact', head: true })
      .eq('places.partner_id', partnerId).gte('clicked_at', startThisMonth.toISOString()),
    supabase.from('place_clicks').select('id, places!inner(partner_id)', { count: 'exact', head: true })
      .eq('places.partner_id', partnerId)
      .gte('clicked_at', startLastMonth.toISOString())
      .lt('clicked_at', startThisMonth.toISOString()),
  ])

  return {
    activePlaceCount: activeNow.count ?? 0,
    activePlaceCountLastMonth: activeLastMonthEnd.count ?? 0,
    clicksThisMonth: clicksThis.count ?? 0,
    clicksLastMonth: clicksLast.count ?? 0,
  }
}

export async function updateReportOptIn(optIn: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { error } = await supabase
    .from('partners')
    .update({ monthly_report_opt_in: optIn })
    .eq('user_id', user.id)
    .eq('status', 'approved')
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/settings')
}

// 해지 = 개인정보 파기(tombstone). 채널 식별정보·계정연결을 지우고, status를
// 'approved'에서 떨어뜨려 대시보드 미들웨어가 즉시 차단하게 하며, 장소를 숨겨
// 공개된 것이 남지 않게 한다. 행은 남지만 개인정보는 남지 않는다.
export async function withdrawPartner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: partner, error: fetchError } = await supabase
    .from('partners')
    .select('id, is_demo')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (fetchError || !partner) throw new Error('파트너 정보를 찾을 수 없습니다.')

  // 데모 계정은 자기해지를 막는다 — 해지하면 아래 hidePartnerPlaces가 데모 장소를 전부
  // 숨겨 영업 시연 지도가 꺼진다. 관리자 해제(resetPartnerStatus)에는 이 가드를 두지 않아
  // 운영자가 필요하면 해제할 수 있다.
  // ★ is_demo는 저장소에 SQL 정의가 없어(대시보드 수동 추가) nullable 여부가 불명 →
  // truthy가 아니라 === true 로 엄격 비교한다.
  if (partner.is_demo === true) throw new Error('데모 계정은 탈퇴할 수 없습니다.')

  await hidePartnerPlaces(supabase, partner.id)

  // 해지 = 개인정보 파기 + tombstone. 행 자체는 남긴다 —
  //   • places.partner_id가 FK로 이 행을 가리켜서(on delete cascade) 지우면 POI가 통째로 소멸
  //   • channel_id가 있어야 재가입 시 completePartnerSignup의 existing 조회가 적중해
  //     UPDATE 브랜치를 타고, 그 브랜치가 opt_in을 안 건드려 수신거부가 보존된다
  // 존치(건드리지 않음): id·channel_id·created_at·monthly_report_opt_in·is_demo.
  // 근거는 supabase/sql/partners_withdraw_purge.sql 참조.
  // 토큰 2개는 원래 여기서 null 처리하던 것이 파기 목록에 그대로 흡수됐다.
  const { error } = await supabase
    .from('partners')
    .update({
      status: 'withdrawn',
      channel_name: null,
      avatar_url: null,
      subscriber_count: null,
      user_id: null,
      categories: null,
      region: null,
      grade: null,
      rejection_reason: null,
      youtube_access_token: null,
      youtube_refresh_token: null,
    })
    .eq('id', partner.id)
  if (error) throw new Error(error.message)

  redirect('/')
}
