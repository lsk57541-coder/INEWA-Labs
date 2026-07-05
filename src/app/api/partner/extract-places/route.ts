import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getVideoSnippet, extractPlaceList, extractWithClaude } from '@/lib/extractPlaces'

// 추출 시도 결과(done/empty/error)를 partner_videos에 기록 — "추출했으나 0개(empty)"를 남겨
// 재추출 낭비를 막는다. ★베스트에포트: consent/verification 로그 패턴대로 실패해도 throw하지
// 않는다(기록 실패가 추출 응답을 막으면 안 됨).
// ★upsert 필드군 분리: 상태 3필드만 갱신하고 title/thumbnail/published_at/synced_at은 절대
//   건드리지 않는다(채널 동기화 S5가 채우는 필드 — 상호 배타). Supabase .upsert()는 on conflict
//   시 넘긴 컬럼을 전부 덮으므로, "UPDATE 먼저 → 없으면 INSERT"로 갱신 컬럼을 정확히 제한한다.
async function recordExtractStatus(
  partnerId: string,
  videoId: string,
  status: 'done' | 'empty' | 'error',
  isDemo: boolean,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  try {
    const admin = createServiceClient(url, serviceKey)
    const now = new Date().toISOString()
    // 1) 기존 row면 상태 3필드만 갱신(title 등 보존).
    const { data: updated } = await admin
      .from('partner_videos')
      .update({ extract_status: status, extracted_at: now, updated_at: now })
      .eq('partner_id', partnerId)
      .eq('video_id', videoId)
      .select('video_id')
    // 2) 없으면 신규 INSERT(is_demo·synced_at은 default/명시로 채움).
    if (!updated || updated.length === 0) {
      await admin.from('partner_videos').insert({
        partner_id: partnerId,
        video_id: videoId,
        extract_status: status,
        extracted_at: now,
        is_demo: isDemo,
        updated_at: now,
      })
    }
  } catch (e) {
    console.error(`[extract-places] extract_status 기록 실패 (video=${videoId}):`, e instanceof Error ? e.message : e)
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id, channel_id, is_demo')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId param' }, { status: 400 })

  const snippet = await getVideoSnippet(videoId)
  if (!snippet) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  if (snippet.channelId !== partner.channel_id) {
    return NextResponse.json({ error: '본인 채널 영상만 등록할 수 있습니다' }, { status: 403 })
  }

  // 추출 엔진(extractPlaceList/extractWithClaude)은 공유 함수라 변경하지 않고 호출만.
  // Claude(Haiku) 지연/실패/rate limit 시 504(비JSON)로 끝나 클라가 무한로딩되던 걸 막기 위해
  // try/catch로 감싸 JSON 에러로 응답한다.
  try {
    let places = extractPlaceList(snippet.title, snippet.description)
    if (places.length === 0) {
      // 폴백: extractWithClaude는 source를 안 붙여 반환하므로 라우트에서 'ai' 태깅
      // (extractMultiPlaces와 동일 패턴, 엔진 무수정). 안 하면 AI 추출분이 places.source NULL로 저장됨.
      places = (await extractWithClaude(snippet.title, snippet.description)).map(p => ({ ...p, source: 'ai' as const }))
    }
    // 추출 시도 결과 기록: 후보 1개+ → done, 0개 → empty(재추출 회피 핵심). 저장 여부와 무관.
    await recordExtractStatus(partner.id, videoId, places.length > 0 ? 'done' : 'empty', partner.is_demo)
    // 입력 시 저장(2단계)용 영상 메타 — 추가 quota 없이 getVideoSnippet에서 함께 옴.
    return NextResponse.json({ places, viewCount: snippet.viewCount, publishedAt: snippet.publishedAt })
  } catch {
    await recordExtractStatus(partner.id, videoId, 'error', partner.is_demo)
    return NextResponse.json({ error: '장소 추출에 실패했어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
  }
}
