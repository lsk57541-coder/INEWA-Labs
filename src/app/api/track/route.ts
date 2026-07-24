import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// 트래픽 계측 수신 — 장소↔영상 유입(파트너 수익공유 정산 근거) + 장소 클릭.
// ★service_role로 RLS 우회(서버 전용 키, 클라 노출 금지). partner_id는 클라가 보낸 값을
//   절대 신뢰하지 않고 placeId로 places를 조회해 서버가 확정한다(위변조 방어).
//   ip_hash는 NULL(자문 통과 후 도입), user_id 미연결(익명 — 개인추적 안 함).
// ★항상 빠르게 204. 계측 실패가 사용자 행동(재생/클릭/공유)을 막지 않도록 에러는
//   console.error 흔적만 남기고 모두 삼킨다(throw 없음).

const VALID_EVENTS = new Set(['place_click', 'embed_play', 'kakao_share'])

// place·IP·시간당 계측 상한. 정상 사용자 여유 + 남용 억제. 실사용 데이터로 튜닝(상수 분리).
const TRACK_RATE_CAP = 20

// place+IP 단위 시간당 캡. ★검색 rate limit 자산(search_rate_limits 테이블 + bump_search_rate RPC,
// pg_cron cleanup)을 identifier 네임스페이스만 분리해 재사용 — 새 테이블/RPC/스키마 변경 0.
// ★service_role 클라이언트로 RPC 호출(검색의 checkKeywordRateLimit과 동일 패턴 — 함수 로컬 생성).
// ★fail-open: salt 미설정·env 누락·RPC 오류·예외 시 방어를 끄고 계측을 계속한다(방어 실패로 정상
//   유입을 누락시키지 않음 — 검색 rate limit의 fail-open 패턴과 동일). 단 조용히 삼키지 않고 console.error.
async function isTrackRateLimited(req: NextRequest, placeId: string): Promise<boolean> {
  const salt = process.env.TRACK_IP_HASH_SALT // ★서버 전용. NEXT_PUBLIC_ 금지.
  if (!salt) {
    console.error('[track] rate-limit 비활성: TRACK_IP_HASH_SALT 미설정(fail-open)')
    return false // 방어 없이 계측 계속
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[track] rate-limit 비활성: Supabase env 미설정(fail-open)')
    return false
  }
  try {
    const fwd = req.headers.get('x-forwarded-for') ?? ''
    const ip = fwd.split(',')[0].trim() || 'unknown'
    // ★salt+IP 해시. 원문 IP는 저장·로그하지 않는다. 검색 rate limit의 무salt 방식과 달리 env salt를
    //   섞어 레인보우 역산을 차단(track 전용 — 검색 경로엔 영향 없음). ip_hash는 DB에 저장하지 않음.
    const ipHash = createHash('sha256').update(salt + ip).digest('hex')
    const identifier = `track:place:${placeId}:ip:${ipHash}` // ★track 네임스페이스로 검색 rate와 분리

    const db = createClient(url, serviceKey) // service_role — 검색 rate limit과 동일(함수 로컬)
    const now = new Date()
    const windowStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
    ))
    const { data, error } = await db.rpc('bump_search_rate', {
      p_identifier: identifier,
      p_window: windowStart.toISOString(),
    })
    if (error) {
      console.error('[track] rate-limit rpc 실패(fail-open):', error.message)
      return false
    }
    const count = typeof data === 'number' ? data : 0
    return count > TRACK_RATE_CAP
  } catch (e) {
    console.error('[track] rate-limit 예외(fail-open):', e instanceof Error ? e.message : e)
    return false
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

    // ★남용 방지: place+IP 시간당 캡 초과분은 조용히 집계 스킵(INSERT 생략). 응답은 204 유지 —
    //   429를 주지 않는다(fire-and-forget이라 클라가 반응 못 하고, 계측 여부를 노출하지 않음).
    if (await isTrackRateLimited(req, placeId)) {
      console.error('[track] rate-skip', { placeId, event }) // ★IP·해시·user_id 등 개인정보 없음
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
