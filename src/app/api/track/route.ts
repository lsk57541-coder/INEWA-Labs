import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// 트래픽 계측 수신 — 장소↔영상 유입(파트너 수익공유 정산 근거) + 장소 클릭.
// ★service_role로 RLS 우회(서버 전용 키, 클라 노출 금지). partner_id는 클라가 보낸 값을
//   절대 신뢰하지 않고 placeId로 places를 조회해 서버가 확정한다(위변조 방어).
//   ip_hash는 NULL(자문 통과 후 도입), user_id 미연결(익명 — 개인추적 안 함).
// ★항상 빠르게 204. 계측 실패가 사용자 행동(재생/클릭/공유)을 막지 않도록 에러는
//   console.error 흔적만 남기고 모두 삼킨다(throw 없음).

const VALID_EVENTS = new Set(['place_click', 'embed_play', 'kakao_share'])

// track 계측 이중 상한(둘 다 시간당). event×place×IP 단위 + IP 전역 단위로 남용 억제.
const EVENT_CAP = 10
const GLOBAL_CAP = 120

// 설정 누락은 프로세스 내내 고정 → 로그 폭증 방지 위해 모듈 레벨 1회만 warn.
let warnedSalt = false
let warnedEnv = false

// track 계측 게이트. 'proceed'=계측 진행, 'skip'=계측 생략(응답은 항상 204).
// ★fail-CLOSED: 설정/RPC/예외 실패 시 방어를 켠 채 계측 생략(검색의 fail-open과 반대 — 데이터는 오노출<미노출로 닫는다).
// ★검색 rate limit 자산(search_rate_limits + bump_search_rate) 재사용, 네임스페이스만 분리. 원문 IP·HMAC 저장/로그 금지.
async function trackRateGate(req: NextRequest, placeId: string, event: string): Promise<'proceed' | 'skip'> {
  const salt = process.env.TRACK_IP_HASH_SALT
  if (!salt) {
    if (!warnedSalt) { console.error('[track] limiter-error: TRACK_IP_HASH_SALT 미설정(fail-closed, 계측 생략)'); warnedSalt = true }
    return 'skip'
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    if (!warnedEnv) { console.error('[track] limiter-error: Supabase env 미설정(fail-closed, 계측 생략)'); warnedEnv = true }
    return 'skip'
  }
  try {
    const fwd = req.headers.get('x-forwarded-for') ?? ''
    const ip = fwd.split(',')[0].trim() || 'unknown'
    // ★HMAC-SHA256(key=salt, msg=IP). 원문 IP·HMAC는 저장·로그 금지.
    const hmac = createHmac('sha256', salt).update(ip).digest('hex')
    const idEvent = `track:event:${event}:place:${placeId}:ip:${hmac}`
    const idGlobal = `track:global:ip:${hmac}`

    const db = createClient(url, serviceKey)
    const now = new Date()
    const windowStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
    )).toISOString()

    const bump = async (identifier: string): Promise<number> => {
      const { data, error } = await db.rpc('bump_search_rate', { p_identifier: identifier, p_window: windowStart })
      if (error) throw new Error(error.message)
      return typeof data === 'number' ? data : 0
    }

    // 두 limiter 모두 호출(단락 없음): 한쪽에 막힌 요청도 다른 버킷을 정확히 +1. bump는 원자적.
    const cEvent = await bump(idEvent)
    const cGlobal = await bump(idGlobal)
    if (cEvent > EVENT_CAP || cGlobal > GLOBAL_CAP) {
      console.error('[track] rate-skip', { placeId, event }) // ★IP·해시·user_id 등 개인정보 없음
      return 'skip'
    }
    return 'proceed'
  } catch (e) {
    console.error('[track] limiter-error(fail-closed, 계측 생략):', e instanceof Error ? e.message : e)
    return 'skip'
  }
}

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
    // ★공개(active) 장소만 계측 — hidden/deleted/reviewing 장소의 클릭·유입은 정산 근거에서 제외.
    //   응답은 204 유지(계측 여부를 클라에 노출하지 않음).
    if (place.status !== 'active') return new NextResponse(null, { status: 204 })

    // ★게이트가 skip이면 계측 생략(INSERT·click_count 금지). 응답은 204 유지 —
    //   429를 주지 않는다(fire-and-forget이라 클라가 반응 못 하고, 계측 여부를 노출하지 않음).
    if ((await trackRateGate(req, placeId, event)) === 'skip') {
      return new NextResponse(null, { status: 204 })
    }

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
