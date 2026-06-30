import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 트래픽 계측 수신 — 장소↔영상 유입(파트너 수익공유 정산 근거) + 장소 클릭.
// ★service_role로 RLS 우회(서버 전용 키, 클라 노출 금지). partner_id는 클라가 보낸 값을
//   절대 신뢰하지 않고 placeId로 places를 조회해 서버가 확정한다(위변조 방어).
//   ip_hash는 NULL(자문 통과 후 도입), user_id 미연결(익명 — 개인추적 안 함).
// ★항상 빠르게 204. 계측 실패가 사용자 행동(재생/클릭/공유)을 막지 않도록 에러는
//   console.error 흔적만 남기고 모두 삼킨다(throw 없음).

const VALID_EVENTS = new Set(['place_click', 'embed_play', 'kakao_share'])

export async function POST(req: NextRequest) {
  try {
    const { placeId, event } = (await req.json()) as { placeId?: string; event?: string }
    if (!placeId || !event || !VALID_EVENTS.has(event)) {
      return new NextResponse(null, { status: 204 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return new NextResponse(null, { status: 204 })
    const db = createClient(url, serviceKey)

    // placeId로 partner_id를 서버가 확정(클라 전송값 불신). 없는 장소(비파트너/admin 결과는
    // placeId가 애초에 없어 여기 안 옴 — 방어)면 스킵.
    const { data: place } = await db
      .from('places')
      .select('partner_id, status')
      .eq('id', placeId)
      .maybeSingle()
    if (!place) return new NextResponse(null, { status: 204 })

    if (event === 'place_click') {
      // place_clicks INSERT → AFTER INSERT 트리거가 places.click_count +1.
      await db.from('place_clicks').insert({ place_id: placeId })
    } else {
      // embed_play | kakao_share → video_referrals. partner_id는 서버 확정값만.
      await db.from('video_referrals').insert({
        place_id: placeId,
        partner_id: place.partner_id, // ★클라 값 아님 — placeId로 조회한 서버 확정값
        type: event,
        // ip_hash: NULL(자문 후 도입), user_id 미연결(익명)
      })
    }

    return new NextResponse(null, { status: 204 })
  } catch (e) {
    // 민감정보 없이 흔적만 — 계측은 부가기능이라 실패해도 사용자 행동은 이미 진행됨.
    console.error('[track] failed:', e instanceof Error ? e.message : e)
    return new NextResponse(null, { status: 204 })
  }
}
