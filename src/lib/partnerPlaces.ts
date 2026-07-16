import type { SupabaseClient } from '@supabase/supabase-js'

// 파트너 해지/해제 시 그 파트너의 장소를 한꺼번에 숨긴다.
// 파트너 본인 탈퇴(partner/dashboard/actions.ts)와 관리자 해제(admin/partners/[id]/actions.ts)는
// 인증 모델도 클라이언트도 달라 공통 조상이 없다. 그래서 클라이언트를 인자로 받아 양쪽이
// 각자의 것을 넘긴다 — 관리자는 requireAdmin()이 준 것, 파트너는 본인 세션 것.
//
// ★ 반대방향(hidden → active 복원)은 일부러 만들지 않는다. places.status가 "해지로 숨김"과
// "파트너가 의도적으로 숨김"을 구분하지 못해서, 기계적으로 되살리면 본인이 감춰둔 장소까지
// 다시 공개된다. 복원은 별도 상태값이나 플래그가 필요한 설계 문제라 백로그로 둔다.
export async function hidePartnerPlaces(supabase: SupabaseClient, partnerId: string): Promise<void> {
  const { error } = await supabase.from('places').update({ status: 'hidden' }).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
}
