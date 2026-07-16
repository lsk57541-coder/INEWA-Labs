import type { SupabaseClient } from '@supabase/supabase-js'

// 파트너 해지/해제 시 그 파트너의 장소를 한꺼번에 숨긴다.
//
// ★ 클라이언트를 인자로 받는 이유 — 호출부마다 필요한 권한이 다르다.
//   • 파트너 본인 탈퇴(partner/dashboard/actions.ts): ★service_role. 바로 앞 파기가 partners.user_id를
//     null로 만들어서, 아래 정책의 partners.user_id = auth.uid() 체인이 끊긴다(NULL = uid는 never TRUE)
//     → RLS-bound로는 0행이 되어 장소가 영영 안 숨겨진다.
//   • 관리자 해제(admin/partners/[id]/actions.ts): RLS-bound. 파기를 하지 않아 user_id가 살아 있고
//     admin 정책으로 통과하므로 우회할 이유가 없다.
// 관련 정책: places.sql "partner manages own places" —
//   exists (select 1 from partners where partners.id = places.partner_id and partners.user_id = auth.uid())
//
// ★ 0행을 에러로 보지 않는다 — 장소가 하나도 없는 파트너는 정상적으로 0행이다. 여기서 행 수를
// 검사하면 그 파트너의 탈퇴가 막힌다. (partners 갱신 쪽은 반대로 0행이 곧 실패라 호출부가 검사한다.)
//
// ★ 반대방향(hidden → active 복원)은 일부러 만들지 않는다. places.status가 "해지로 숨김"과
// "파트너가 의도적으로 숨김"을 구분하지 못해서, 기계적으로 되살리면 본인이 감춰둔 장소까지
// 다시 공개된다. 복원은 별도 상태값이나 플래그가 필요한 설계 문제라 백로그로 둔다.
export async function hidePartnerPlaces(supabase: SupabaseClient, partnerId: string): Promise<void> {
  const { error } = await supabase.from('places').update({ status: 'hidden' }).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
}
