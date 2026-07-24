'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 관리자 게이트 — admin/places/actions.ts와 동일 패턴(세션 클라이언트, profiles.role 확인).
// ★RPC는 이 세션 클라이언트로 호출한다. service_role로 부르면 함수 내부 auth.uid()가 NULL이 되어
//   'unauthorized'로 실패한다(승인·기각의 실제 보안경계는 RPC 내부의 auth.uid()+role 재검증).
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return supabase
}

// RPC가 raise하는 errcode 메시지 키 → 사용자 안내 문구. ★내부 SQL/개인정보는 노출하지 않는다.
const RPC_ERROR_TEXT: Record<string, string> = {
  unauthorized: '로그인이 필요해요. 다시 로그인해 주세요.',
  forbidden: '관리자만 처리할 수 있어요.',
  report_not_found: '신고를 찾을 수 없어요. 목록을 새로고침해 주세요.',
  not_a_location_report: '위치 보정 대상(주소 오류) 신고가 아니에요.',
  already_decided: '이미 처리된 신고예요. 목록을 새로고침해 주세요.',
  invalid_selection: '좌표·주소를 다시 선택해 주세요.',
}
function mapRpcError(message: string): string {
  for (const key of Object.keys(RPC_ERROR_TEXT)) {
    if (message.includes(key)) return RPC_ERROR_TEXT[key]
  }
  // EXECUTE 권한 부여 전(P0-4B GRANT 이전)엔 "permission denied for function ..."가 정상 — 일반 문구로.
  return '처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.'
}

export async function approveCorrection(input: {
  reportId: string
  videoId: string
  lat: number
  lng: number
  address: string
  placeName?: string | null
  note?: string | null
}): Promise<{ error?: string }> {
  const supabase = await requireAdmin()
  const { error } = await supabase.rpc('approve_location_correction', {
    p_location_report_id: input.reportId,
    p_selected_lat: input.lat,
    p_selected_lng: input.lng,
    p_selected_address: input.address,
    p_selected_place_name: input.placeName ?? null,
    p_review_note: input.note ?? null,
  })
  if (error) {
    console.error('[correction] op=approve 실패', { video_id: input.videoId, code: error.code, message: error.message })
    return { error: mapRpcError(error.message) }
  }
  revalidatePath('/admin/corrections')
  return {}
}

export async function rejectCorrection(input: {
  reportId: string
  videoId: string
  note?: string | null
}): Promise<{ error?: string }> {
  const supabase = await requireAdmin()
  const { error } = await supabase.rpc('reject_location_correction', {
    p_location_report_id: input.reportId,
    p_review_note: input.note ?? null,
  })
  if (error) {
    console.error('[correction] op=reject 실패', { video_id: input.videoId, code: error.code, message: error.message })
    return { error: mapRpcError(error.message) }
  }
  revalidatePath('/admin/corrections')
  return {}
}
