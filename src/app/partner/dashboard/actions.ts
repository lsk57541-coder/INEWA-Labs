'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

// Soft-delete: keeps the row for history, but flips status away from
// 'approved' so the dashboard middleware locks them out immediately. Also
// hides their places so nothing of theirs stays publicly visible.
export async function withdrawPartner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: partner, error: fetchError } = await supabase
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (fetchError || !partner) throw new Error('파트너 정보를 찾을 수 없습니다.')

  const { error: hideError } = await supabase.from('places').update({ status: 'hidden' }).eq('partner_id', partner.id)
  if (hideError) throw new Error(hideError.message)

  // 탈퇴 = soft-delete(행·이력 보존)이되 OAuth 토큰은 즉시 파기(방침 8조 "탈퇴 시 즉시 삭제"
  // 일치). 재가입 시 재연동(OAuth)에서 토큰이 다시 채워지므로 복귀 무손상.
  const { error } = await supabase
    .from('partners')
    .update({ status: 'withdrawn', youtube_access_token: null, youtube_refresh_token: null })
    .eq('id', partner.id)
  if (error) throw new Error(error.message)

  redirect('/')
}
