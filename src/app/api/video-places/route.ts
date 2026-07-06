import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { haversineKm } from '@/lib/haversine'
import { getRegionName, getCityName } from '@/lib/geocode'
import { isCompilationVideo, resolveCompilationPlaces } from '@/lib/extractPlaces'
import type { VideoResult } from '@/app/api/search/route'

// "영상 단위 장소 전체 보기" — 한 영상(videoId)에 연결된 모든 장소를 ★반경 무시하고 반환.
// /api/search(반경 검색)와 완전 분리된 별도 엔드포인트 → 반경 검색 로직에 회귀 0.
// 반경무시 방식은 채널 모드가 이미 쓰는 resolveCompilationPlaces({ radius: Infinity })를 "영상 1개"로 좁힌 형태
// (그 함수 본문은 무수정, 호출 인자 radius만 Infinity). quota: search.list(100유닛) 미사용,
// 등록장소 히트 시 YouTube 호출 0, 라이브도 videos.list 1유닛 + Kakao(무료) + AI haiku 1회뿐.

// video_url → 11자 videoId (route.ts:608 extractYoutubeId와 동일 로직; 앱 전역 관례상 로컬 복제).
function extractYoutubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null)
}

// 지리 대조 가드 — route.ts addressCorroborated와 동일(순수 함수). resolveCompilationPlaces가
// adminDesc=null일 때 오매칭 차단용으로 호출한다. route.ts 무수정 유지를 위해 로컬 복제.
function addressCorroborated(address: string, text: string): boolean {
  const parts = (address ?? '').split(/\s+/).slice(0, 3)
  const tokens = new Set<string>()
  for (const p of parts) {
    if (p && p.length >= 2) tokens.add(p)
    const stripped = p.replace(/(특별자치시|특별자치도|특별시|광역시|도|시|군|구|읍|면|동|리|가)$/, '')
    if (stripped.length >= 2 && stripped !== p) tokens.add(stripped)
  }
  for (const t of tokens) if (text.includes(t)) return true
  return false
}

// 검색어(카테고리)가 없는 영상 스코프이므로 카테고리 가드를 사실상 열어둔다(모든 장소그룹 허용).
const ALL_GROUPS = ['FD6', 'CE7', 'AD5', 'AT4', 'CT1']

// (1) 등록장소(파트너 places + 데모/admin locations)에서 이 영상의 장소 전부 — 반경 무시, videoId 스코프.
// getRegisteredResults(route.ts:616)를 "반경 필터 제거 + videoId 필터"로 미러링. 검증좌표라 정확.
async function getVideoRegisteredPlaces(videoId: string, lat: number, lng: number): Promise<VideoResult[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return []
  const db = createClient(url, serviceKey)
  const out: VideoResult[] = []

  // (a) 데모/admin: videos.youtube_id → location_id → locations
  const { data: vids } = await db
    .from('videos')
    .select('youtube_id, title, thumbnail, channel, location_id, published_at, view_count, subscriber_count')
    .eq('youtube_id', videoId)
  const locIds = [...new Set((vids ?? []).map((v) => v.location_id).filter(Boolean))]
  const locById = new Map<string, { id: string; name: string; lat: number; lng: number; category: string | null; phone: string | null; kakao_place_id: string | null }>()
  if (locIds.length > 0) {
    const { data: locs } = await db.from('locations').select('id, name, lat, lng, category, phone, kakao_place_id').in('id', locIds)
    for (const l of locs ?? []) locById.set(l.id, l)
  }
  for (const v of vids ?? []) {
    const loc = locById.get(v.location_id)
    if (!loc || loc.lat == null || loc.lng == null) continue
    out.push({
      videoId, title: v.title ?? loc.name, thumbnail: v.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      channel: v.channel ?? '', lat: loc.lat, lng: loc.lng,
      distanceKm: Math.round(haversineKm(lat, lng, loc.lat, loc.lng) * 10) / 10,
      source: 'geotag', viewCount: v.view_count ?? 0, placeName: loc.name, placeNameSource: 'correction',
      duration: '', isShort: false, subscriberTier: null, subscriberCount: v.subscriber_count ?? 0,
      publishedAt: v.published_at ?? undefined, category: loc.category ?? undefined,
      phone: loc.phone ?? undefined, kakaoPlaceId: loc.kakao_place_id ?? undefined,
    })
  }

  // (b) 파트너: places(status=active) 중 video_url에 이 videoId 포함
  const { data: places } = await db
    .from('places')
    .select('id, name, video_url, latitude, longitude, category, address, view_count, subscriber_count, published_at, partner_id, verification_status, phone, kakao_place_id')
    .eq('status', 'active')
    .ilike('video_url', `%${videoId}%`)
  const partnerIds = [...new Set((places ?? []).map((p) => p.partner_id).filter(Boolean) as string[])]
  const partnerMap = new Map<string, { channel_name: string; avatar_url: string | null; subscriber_count: number | null }>()
  if (partnerIds.length > 0) {
    const { data: partners } = await db.from('partners').select('id, channel_name, avatar_url, subscriber_count').in('id', partnerIds)
    for (const pt of partners ?? []) partnerMap.set(pt.id, pt)
  }
  for (const p of places ?? []) {
    if (p.latitude == null || p.longitude == null) continue
    if (extractYoutubeId(p.video_url ?? '') !== videoId) continue // ilike 부분매칭 오탐 방지(정확 videoId만)
    const partner = p.partner_id ? partnerMap.get(p.partner_id) : undefined
    out.push({
      videoId, title: p.name, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      channel: partner?.channel_name ?? p.category ?? '', lat: p.latitude, lng: p.longitude,
      distanceKm: Math.round(haversineKm(lat, lng, p.latitude, p.longitude) * 10) / 10,
      source: 'geotag', viewCount: p.view_count ?? 0, placeName: p.name, placeNameSource: 'correction',
      duration: '', isShort: false, subscriberTier: null, subscriberCount: partner?.subscriber_count ?? p.subscriber_count ?? 0,
      publishedAt: p.published_at ?? undefined, isPartner: !!partner, partnerThumbnail: partner?.avatar_url ?? null,
      placeId: p.id, verificationStatus: (p.verification_status ?? undefined) as VideoResult['verificationStatus'],
      address: p.address ?? undefined, category: p.category ?? undefined,
      phone: p.phone ?? undefined, kakaoPlaceId: p.kakao_place_id ?? undefined,
    })
  }

  // 같은 좌표(3자리) 중복만 제거 — admin+partner가 같은 장소를 등록한 경우.
  const seen = new Set<string>()
  return out.filter((r) => {
    const k = `${r.lat.toFixed(3)}:${r.lng.toFixed(3)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// 라이브 추출용 영상 메타(제목·설명·채널·조회수). videos.list 1유닛.
async function fetchVideoMeta(videoId: string) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const params = new URLSearchParams({ part: 'snippet,statistics', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return null
  const j = (await res.json()) as {
    items?: { snippet: { title: string; description?: string; channelTitle?: string; publishedAt?: string }; statistics?: { viewCount?: string } }[]
  }
  const it = j.items?.[0]
  if (!it) return null
  return {
    title: it.snippet.title, description: it.snippet.description ?? '', channel: it.snippet.channelTitle ?? '',
    publishedAt: it.snippet.publishedAt, viewCount: parseInt(it.statistics?.viewCount ?? '0', 10),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const videoId = searchParams.get('videoId')?.trim()
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  if (!videoId || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'videoId, lat, lng are required' }, { status: 400 })
  }

  // ── 캐시 자리(fast-follow) ──────────────────────────────────────────────
  // 장소는 안 변하므로 vp:${videoId} 키로 search_cache에 캐시하면 반복 조회 시 AI/지오코딩 0.
  // 이번 스코프에선 미구현 — 아래 라이브 추출 결과를 여기서 캐시 저장/조회할 지점만 남겨둔다.
  // const cached = await getCachedVideoPlaces(`vp:${videoId}`); if (cached) return NextResponse.json({ results: cached })
  // ────────────────────────────────────────────────────────────────────────

  // (1) 등록장소 우선 — 파트너/데모 검증좌표라 정확. 있으면 라이브 추출 불필요(AI 0).
  let results = await getVideoRegisteredPlaces(videoId, lat, lng)

  // (2) 등록장소 없으면 순수검색 라이브 추출(반경 무시). 모음영상만 대상(단일장소는 이미 검색에 뜸).
  if (results.length === 0) {
    const meta = await fetchVideoMeta(videoId)
    if (meta && isCompilationVideo(meta.title, meta.description)) {
      const [regionName, cityPrefix] = await Promise.all([getRegionName(lat, lng), getCityName(lat, lng)])
      const anchor = `${cityPrefix ? cityPrefix + ' ' : ''}${regionName ?? ''}`.trim()
      const resolved = await resolveCompilationPlaces({
        videoId, title: meta.title, description: meta.description,
        regionName: anchor || null, lat, lng,
        radius: Infinity, // ★반경 무시 — resolveCompilationPlaces 본문 무수정, 인자만 다르게 호출
        adminDesc: null, allowedGroups: ALL_GROUPS,
        withinAdminArea: () => true, // adminDesc=null이라 실제 미호출(시그니처 충족용 stub)
        addressCorroborated, // 오매칭 차단 가드(순수 함수 로컬 복제)
      })
      const thumb = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
      results = resolved.map((r): VideoResult => ({
        videoId, title: meta.title, thumbnail: thumb, channel: meta.channel,
        lat: r.lat, lng: r.lng, distanceKm: r.distanceKm, source: 'ai',
        viewCount: meta.viewCount, placeName: r.name, placeNameSource: 'explicit_description',
        duration: '', isShort: false, subscriberTier: null, subscriberCount: 0,
        startSec: r.startSec, publishedAt: meta.publishedAt, isCompilation: true,
        phone: r.phone, kakaoPlaceId: r.kakaoPlaceId,
      }))
    }
  }

  // 챕터(startSec) 순 정렬 — 클라 번호마커/리스트가 영상 타임라인 순서(1,2,3…)로 표시.
  results.sort((a, b) => (a.startSec ?? Number.MAX_SAFE_INTEGER) - (b.startSec ?? Number.MAX_SAFE_INTEGER))

  // ── 캐시 자리(fast-follow): 여기서 vp:${videoId}에 results 저장 예정(이번엔 미구현). ──

  return NextResponse.json({ results })
}
