'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { hidePartnerPlaces } from '@/lib/partnerPlaces'

// ★ partners 는 UPDATE RLS 정책이 admin 전용("admin can update partner applications") 하나뿐이라,
// 파트너 세션(role='user')으로는 자기 행조차 못 고친다 — 0행이 되는데 PostgREST 는 0행 UPDATE 를
// 에러로 보지 않아 "성공한 척" 지나간다. completePartnerSignup(apply/actions.ts:58-61)이 같은 이유로
// 쓰는 service_role 패턴을 그대로 재사용한다("update 정책은 admin 전용뿐" 주석 참조).
//
// ★★ 인가는 약해지지 않는다 — 이 클라이언트를 쓰는 두 곳 모두 대상 행을 서버 getUser() 기반으로
// 이미 한정한 뒤에만 호출한다(withdrawPartner 는 .eq('user_id', user.id).single() 로 얻은 partner.id,
// updateReportOptIn 은 .eq('user_id', user.id)). 클라이언트가 대상 행을 주입할 경로 자체가 없다.
// 재활성화(ceef717)에서 확립한 "검증이 아니라 주입 경로를 없앤다"와 같은 구조다.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('서버 설정 오류로 처리하지 못했습니다.')
  return createServiceClient(url, serviceKey)
}

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

  // ★ service_role — serviceClient() 주석 참조. RLS-bound 로는 0행이라 토글이 켜진 채
  // DB 는 그대로인 "거짓 성공"이 났다. 안전선은 그대로 유지:
  //   .eq('user_id', user.id)     — 자기 행만
  //   .eq('status', 'approved')   — 해지 후엔 못 바꿈(해지 시점 값 동결 = 의도된 동작)
  const { data, error } = await serviceClient()
    .from('partners')
    .update({ monthly_report_opt_in: optIn })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .select('id')
  if (error) throw new Error(error.message)
  // 0행 방어 — service_role 이라 RLS 로는 안 막히지만, 조건 불일치(그 사이 해지됨 등)로 0행일 수
  // 있다. 그때 조용히 지나가면 다시 "거짓 성공"이다. 호출부(SettingsControls:17)가 catch 해서
  // 토글을 원래대로 되돌리므로 사용자에게 "안 됐다"가 보인다.
  if (data?.length !== 1) throw new Error('수신 설정을 변경하지 못했습니다.')
  revalidatePath('/partner/dashboard/settings')
}

// 해지 = 개인정보 파기(tombstone). 채널 식별정보·계정연결을 지우고, status를
// 'approved'에서 떨어뜨려 대시보드 미들웨어가 즉시 차단하게 하며, 장소를 숨겨
// 공개된 것이 남지 않게 한다. 행은 남지만 개인정보는 남지 않는다.
// expected error(로그인만료·파트너없음·데모가드·0행실패)는 throw 대신 {error:'키'}로 반환한다 —
// Next 프로덕션은 Server Action throw의 message를 generic으로 가려(error.tsx의 message 분기가 무력),
// 호출부(SettingsControls)가 이 키를 받아 인라인 배너로 안내한다. 진짜 예외(DB error 등)는 throw 유지.
export async function withdrawPartner(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'login_expired' }

  // 조회는 RLS-bound 로 충분하다 — "select own partner application"(auth.uid() = user_id)이 통과시킨다.
  // ★ 여기서 얻은 partner.id 가 아래 파기의 유일한 안전선이다: user.id 로 한정해 조회한 결과이므로
  // 자기 행임이 보장되고, .single() 이라 단일 행이 확정된다.
  const { data: partner, error: fetchError } = await supabase
    .from('partners')
    .select('id, is_demo')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (fetchError || !partner) return { error: 'no_partner' }

  // 데모 계정은 자기해지를 막는다 — 해지하면 아래 hidePartnerPlaces가 데모 장소를 전부
  // 숨겨 영업 시연 지도가 꺼진다. 관리자 해제(resetPartnerStatus)에는 이 가드를 두지 않아
  // 운영자가 필요하면 해제할 수 있다.
  // ★ is_demo는 저장소에 SQL 정의가 없어(대시보드 수동 추가) nullable 여부가 불명 →
  // truthy가 아니라 === true 로 엄격 비교한다.
  if (partner.is_demo === true) return { error: 'is_demo' }

  // 해지 = 개인정보 파기 + tombstone. 행 자체는 남긴다 —
  //   • places.partner_id가 FK로 이 행을 가리켜서(on delete cascade) 지우면 POI가 통째로 소멸
  //   • channel_id가 있어야 재가입 시 completePartnerSignup의 existing 조회가 적중해
  //     UPDATE 브랜치를 타고, 그 브랜치가 opt_in을 안 건드려 수신거부가 보존된다
  // 존치(건드리지 않음): id·channel_id·created_at·monthly_report_opt_in·is_demo.
  // 근거는 supabase/sql/partners_withdraw_purge.sql 참조.
  // 토큰 2개는 원래 여기서 null 처리하던 것이 파기 목록에 그대로 흡수됐다.
  //
  // ★ 순서: 파기 먼저, 장소 숨김 나중 — 되돌릴 수 없는 쪽을 뒤에 둔다. 파기가 실패하면 장소를
  // 손대지 않은 채 끝나서 "아무 일도 없었던 상태"가 된다. 반대로 두면(예전 순서) 장소만 숨겨지고
  // 파기는 안 된 상태로 남는데, hidden → active 복원 코드가 없어 되돌릴 방법이 없다.
  const { data: purged, error } = await serviceClient()
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
    .select('id')
  if (error) throw new Error(error.message)
  // 0행 방어 — service_role 이라 RLS 로는 안 막히지만, 그 사이 행이 사라지는 등으로 0행이면
  // 조용히 지나가서는 안 된다(파기가 안 됐는데 성공한 척 리다이렉트되는 게 이 버그의 본질).
  // return 하면 아래 redirect 가 실행되지 않아 설정 화면에 그대로 남고, 호출부가 배너로 안내한다.
  if (purged?.length !== 1) return { error: 'withdraw_failed' }

  // ★ 장소 숨김도 service_role — 위 파기가 user_id 를 null 로 만든 순간, places 정책
  // "partner manages own places"(partners.user_id = auth.uid())의 체인이 끊겨 RLS-bound 로는
  // 0행이 된다(NULL = auth.uid() 는 never TRUE). 파기 뒤에 두기로 한 이상 여기도 우회가 강제된다.
  // 공격면은 넓어지지 않는다 — partner.id 는 위에서 user.id 로 한정해 얻은 자기 행이다.
  // ※ 관리자 해제(admin/partners/[id]/actions.ts)는 파기를 하지 않아 user_id 가 살아 있고
  //    admin 정책으로 통과하므로 계속 RLS-bound 클라이언트를 넘긴다(헬퍼는 클라이언트를 인자로 받음).
  await hidePartnerPlaces(serviceClient(), partner.id)

  redirect('/')
}
