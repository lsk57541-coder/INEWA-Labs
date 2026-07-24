import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { haversineKm } from '@/lib/haversine'
import { normName } from '@/lib/normName'
import { geocodeKorean, reverseGeocode, searchPlaceInfo, getRegionName, getCityName } from '@/lib/geocode'
import { buildHeuristicPlaceQueries, extractPlaceByAI, extractStatedBusinessName } from '@/lib/extractLocation'
import { isCompilationVideo, resolveCompilationPlaces, nameInText } from '@/lib/extractPlaces'
import { getMinConfidenceSetting } from '@/app/actions'
import { selectAllPaged } from '@/lib/supabasePaging'
import { PLACENAME_SOURCES, type MinConfidenceSource } from '@/lib/placeNameSources'

const REPORT_THRESHOLD = 3

// Blocked for everyone: either enough independent reports, or a single
// admin report (admins are trusted to call this correctly, so we don't make
// them wait for the threshold). wrong_address is excluded from the
// single-report admin rule since it's a location-fix request, not a
// moderation flag — it goes through location_corrections instead.
async function getBlockedVideoIds(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return new Set()

  const supabase = createClient(url, key)
  // 전체조회 — .range() 없이는 PostgREST 기본 1000행 캡에 걸려 신고가 일부 누락될 수 있다
  // (모더레이션 로직이라 누락 시 차단돼야 할 영상이 재노출되는 방향의 실패라 영향이 큼).
  const data = await selectAllPaged('getBlockedVideoIds.location_reports', (from, to) =>
    supabase.from('location_reports').select('video_id, reason, is_admin_report').order('id', { ascending: true }).range(from, to)
  )

  const counts = new Map<string, number>()
  const blocked = new Set<string>()
  for (const row of data) {
    counts.set(row.video_id, (counts.get(row.video_id) ?? 0) + 1)
    if (row.is_admin_report && row.reason !== 'wrong_address') blocked.add(row.video_id)
  }
  for (const [id, count] of counts) {
    if (count >= REPORT_THRESHOLD) blocked.add(id)
  }
  return blocked
}

// Reported-but-not-yet-globally-blocked videos should still disappear from
// the reporting user's own future searches immediately. wrong_address is
// excluded since that's a fix request — the video should keep showing
// (now with the corrected info), not hide.
async function getMyHiddenVideoIds(): Promise<Set<string>> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Set()

  const { data } = await supabase
    .from('location_reports')
    .select('video_id')
    .eq('user_id', user.id)
    .neq('reason', 'wrong_address')
  return new Set((data ?? []).map((r) => r.video_id))
}

interface LocationCorrection {
  lat: number
  lng: number
  address: string | null
  placeName: string | null
}

// User-confirmed corrections (from "주소/상호명이 잘못됐어요" reports) override
// the geotag/AI-derived location and/or business name. address and placeName
// are corrected independently — e.g. a name-only fix keeps the original
// point, an address-only fix re-resolves the name normally at the new point.
async function getLocationCorrections(): Promise<Map<string, LocationCorrection>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return new Map()

  const supabase = createClient(url, key)
  // 전체조회 — .range() 없이는 PostgREST 기본 1000행 캡에 걸려 일부 video_id의 사용자 보정이
  // Map에서 빠져 옛 주소/상호명이 그대로 노출될 수 있다.
  const data = await selectAllPaged('getLocationCorrections.location_corrections', (from, to) =>
    supabase.from('location_corrections').select('video_id, lat, lng, address, place_name').order('id', { ascending: true }).range(from, to)
  )

  return new Map(data.map((row) => [row.video_id, { lat: row.lat, lng: row.lng, address: row.address, placeName: row.place_name }]))
}

// Caches raw search.list results (the expensive 100-quota-unit call) per
// query/channel + ~1km location grid, so repeated searches — e.g. a user just
// changing the radius slider — reuse the same YouTube results instead of
// re-querying. videos.list/channels.list aren't cached since they're cheap.
const SEARCH_CACHE_TTL_MS = 20 * 60 * 1000
// 채널 결과는 업로드 카탈로그라 자주 안 바뀜 → 길게 캐싱(재검색 quota 0). 채널당 최대 영상 수 상한.
const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CHANNEL_VIDEOS = 200

// 익명/로그인 시간당 키워드검색(캐시미스) 캡. 튜닝 용이하게 상수로 분리(하드코딩 산재 금지).
// 근거: YouTube 일 10,000유닛 ÷ 키워드검색 200~500유닛 = 하루 ~20~50 고유검색이 시스템 천장.
// 정상 사용자는 시간당 고유 미스가 한 자릿수라 익명 10에도 거의 안 걸리고, 스크립트는 걸린다.
const RATE_LIMIT_ANON = 10
const RATE_LIMIT_AUTH = 40

// 키워드검색(q, search.list 200~500유닛/건)만 게이팅. 채널검색은 v1 면제(저위험 ~수유닛+24h캐시,
// 나중 남용 시 별도 캡 추가). 캐시 미스 시점(실제 YouTube 호출 직전)에서만 호출되므로 캐시 히트는
// 구조적으로 자동 면제. ★fail-open: 설정 누락/DB 오류 시 검색을 막지 않고 통과(가용성 우선).
async function checkKeywordRateLimit(
  req: NextRequest,
  userId: string | null
): Promise<{ limited: boolean; retryAfterSec: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { limited: false, retryAfterSec: 0 } // fail-open

  // identifier: 로그인은 user_id(공유 IP 무관), 익명은 IP sha256 해시. ★원문 IP는 저장/로그 금지, 해시만.
  let identifier: string
  let cap: number
  if (userId) {
    identifier = `user:${userId}`
    cap = RATE_LIMIT_AUTH
  } else {
    const fwd = req.headers.get('x-forwarded-for') ?? ''
    const ip = fwd.split(',')[0].trim() || 'unknown'
    identifier = `ip:${createHash('sha256').update(ip).digest('hex')}`
    cap = RATE_LIMIT_ANON
  }

  // 정시(UTC) 시간버킷 — JS에서 일관되게 truncate하면 PG 세션 TZ와 무관하게 내부 일관성 유지.
  const now = new Date()
  const windowStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()
  ))

  try {
    const db = createClient(url, serviceKey)
    // bump_search_rate: (identifier, window)로 원자적 +1 후 새 count 반환(동시요청 언더카운트 없음).
    const { data, error } = await db.rpc('bump_search_rate', {
      p_identifier: identifier,
      p_window: windowStart.toISOString(),
    })
    if (error) {
      console.error('[rate-limit] rpc failed:', error.message)
      return { limited: false, retryAfterSec: 0 } // fail-open
    }
    const count = typeof data === 'number' ? data : 0
    if (count > cap) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + 3600_000 - now.getTime()) / 1000))
      return { limited: true, retryAfterSec }
    }
    return { limited: false, retryAfterSec: 0 }
  } catch (e) {
    console.error('[rate-limit] failed:', e instanceof Error ? e.message : e)
    return { limited: false, retryAfterSec: 0 } // fail-open
  }
}

function searchCacheKey(q: string | undefined, channelId: string | undefined, lat: number, lng: number): string {
  // 채널 후보 풀은 위치 무관(전국, 거리는 다운스트림 계산) → lat/lng 빼서 위치 불문 캐시 재사용.
  if (channelId) return `ch:${channelId}`
  const latR = Math.round(lat * 100) / 100
  const lngR = Math.round(lng * 100) / 100
  return `q:${(q ?? '').toLowerCase().trim()}:${latR}:${lngR}`
}

// search_cache는 RLS가 사실상 무방비(anon 포함 전면 개방)라 다음 단계에서 정책을 잠글 예정 —
// 그때 또 고치지 않도록 읽기·쓰기 둘 다 미리 service_role로 전환한다. anonKey를 안 쓰므로 그 시점에
// SELECT/INSERT/UPDATE를 다 잠가도 이 두 함수는 영향 없음(P0-2). 클라이언트는 각 함수 로컬에서만
// 생성해 다른 쿼리(getRegisteredResults 등 세션/anon 클라이언트)와 공유되지 않게 한다 — RLS 우회 범위를
// search_cache 접근으로만 국한.
async function getCachedSearchItems(key: string, ttlMs = SEARCH_CACHE_TTL_MS): Promise<YTSearchItem[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[search_cache] read skipped: SUPABASE_SERVICE_ROLE_KEY 미설정', { key })
    return null
  }

  const supabase = createClient(url, serviceKey)
  const { data, error } = await supabase.from('search_cache').select('payload, created_at').eq('key', key).maybeSingle()
  if (error) {
    console.error('[search_cache] select 실패', { key, code: error.code, message: error.message })
    return null // fail-open: 캐시 조회 실패는 캐시 미스로 취급 — 검색은 라이브 경로로 계속 진행.
  }
  if (!data) return null
  if (Date.now() - new Date(data.created_at).getTime() > ttlMs) return null
  return data.payload as YTSearchItem[]
}

async function setCachedSearchItems(key: string, items: YTSearchItem[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[search_cache] write skipped: SUPABASE_SERVICE_ROLE_KEY 미설정', { key })
    return
  }

  // 방안 A: 캐시(DB)에 영상 설명란 원문이 남지 않도록 담기 직전 snippet.description만 ''로 비운다.
  // 다른 필드(id.videoId·snippet.channelId·title·thumbnails·publishedAt 등)는 스프레드로 그대로 보존.
  // 추출은 캐시가 아니라 매 요청 fetchVideoDetails(videos.list 신선조회)에서 description을 읽으므로
  // 이 strip은 추출 정확도/비용과 무관하다(읽기/TTL/캐시키 로직은 손대지 않음).
  const payload = items.map((it) => ({ ...it, snippet: { ...it.snippet, description: '' } }))

  const supabase = createClient(url, serviceKey)
  const { error } = await supabase
    .from('search_cache')
    .upsert({ key, payload, created_at: new Date().toISOString() })
  if (error) {
    // fail-open 유지: 캐시 저장 실패가 검색 응답을 막지 않는다(500 없음) — 단, 더 이상 조용히 삼키지 않고 남긴다.
    console.error('[search_cache] upsert 실패', { key, code: error.code, message: error.message })
  }
}

export type SubscriberTier = 'silver' | 'gold' | 'diamond' | 'red_diamond'

// How confident we are in placeName, from most to least reliable. Logged per
// video so accuracy can be measured later (e.g. cross-referenced against
// "주소가 정확하지 않아요" reports) instead of just guessing where to improve.
// PLACENAME_SOURCES에서 파생 — 값 목록과 서열의 단일 출처는 lib/placeNameSources.ts다.
// (예전엔 여기 수동 유니온 + SOURCE_RANK 복제 배열이 따로 있었고, 그쪽에서만 원소가
// 빠지면 타입은 통과하는데 indexOf가 -1이 되어 런타임에 조용히 깨질 수 있었다.)
export type PlaceNameSource = MinConfidenceSource

// PLACENAME_SOURCES는 most to least reliable 순서 — 배열 순서가 곧 서열이다. 어떤
// placeName 출처가 노출할 만큼 신뢰할 수 있는지 판정하며, 임계치는 app_settings로
// admin이 조정한다(getMinConfidenceSetting() 참고).
function meetsConfidence(source: PlaceNameSource, minSource: PlaceNameSource): boolean {
  return PLACENAME_SOURCES.indexOf(source) <= PLACENAME_SOURCES.indexOf(minSource)
}

export interface VideoResult {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  lat: number
  lng: number
  distanceKm: number
  source: 'geotag' | 'ai'
  viewCount: number
  placeName?: string
  placeNameSource: PlaceNameSource
  duration: string
  isShort: boolean
  aspectRatio?: number // 영상 가로/세로 비율(w/h). player 치수 없으면 undefined → 클라가 16:9 폴백
  subscriberTier: SubscriberTier | null
  subscriberCount: number
  startSec?: number // 모음영상 챕터 deep-link (해당 장소 구간부터 재생)
  publishedAt?: string // 영상 업로드일(ISO). 날짜 필터용. videos.list snippet에서. 등록장소는 published_at 또는 미상.
  isPartner?: boolean // 실제 파트너(places.partner_id) 장소 → 금색 마커/PARTNER 배지/상위노출
  partnerThumbnail?: string | null // 파트너 채널 아바타(마커 썸네일). NULL이면 클라가 금색 핀으로 폴백
  placeId?: string // places.id. 파트너 셀프등록 장소 결과에만 실림(admin locations/videos 경로엔 없음). 계측(/api/track)의 장소↔영상 유입 귀속용.
  verificationStatus?: 'unverified' | 'confirmed' | 'rejected' | null // places 검증상태. 파트너가 confirm한 장소만 'confirmed'. 상세 카드 "확인" 배지용. admin locations 경로엔 없음(undefined).
  address?: string // places.address. 상세 카드용. admin locations 경로엔 없음.
  category?: string // places.category(장소 카테고리). channel 폴백과 별개로 독립 노출용. admin locations 경로엔 없음.
  phone?: string // places.phone. 카드 '전화하기'용. 값 있을 때만 버튼 노출. locations 경로엔 없음(undefined).
  kakaoPlaceId?: string // places.kakao_place_id. 카드 카카오 상세 딥링크용. 없으면 좌표 딥링크 폴백.
  isCompilation?: boolean // 모음영상(장소 여럿)에서 온 결과 → 카드에 "이 영상 장소 전체 보기" 진입점 노출용(표시 전용, 반경/정렬/dedup 무영향).
}

// Fire-and-forget log of how each video's place name was resolved. Upserts by
// video_id so repeated searches just refresh the latest resolution.
async function logPlaceNameResolution(videoId: string, source: PlaceNameSource, placeName: string | undefined) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return

  const supabase = createClient(url, key)
  await supabase
    .from('placename_resolutions')
    .upsert({ video_id: videoId, source, place_name: placeName ?? null, updated_at: new Date().toISOString() })
    .then(() => {}, () => {})
}

// L7 단계별 퍼널 계측 — 실시간 검색이 수집→추출→지오코딩→반경→표시 단계에서
// 어디서 새는지 카운트만 남긴다(임시 진단, 7일 자동삭제). track/consent 패턴 재사용:
// ★service_role 전용(RLS로 anon 차단), throw 없음(실패해도 검색 안 막음), YouTube/Kakao 호출 0.
// ★user_id/ip 미저장, 정밀좌표 대신 region(시/군/구)만 — 감사 자산과 완전 별도 테이블.
async function logSearchFunnel(row: {
  query: string | null
  searchType: 'keyword' | 'channel'
  region: string | null
  category: string
  radius: number | null
  collected: number
  extractTargets: number
  extractedOk: number
  radiusPass: number
  displayed: number
  registeredMerged: number
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  try {
    const db = createClient(url, serviceKey)
    await db
      .from('search_funnel_logs')
      .insert({
        query: row.query,
        search_type: row.searchType,
        region: row.region,
        category: row.category,
        radius: row.radius,
        collected: row.collected,
        extract_targets: row.extractTargets,
        extracted_ok: row.extractedOk,
        radius_pass: row.radiusPass,
        displayed: row.displayed,
        registered_merged: row.registeredMerged,
      })
      .then(() => {}, () => {})
  } catch {
    // 진단 로그 실패는 검색에 영향 없음 — 조용히 삼킴.
  }
}

// YouTube's "duration" format is ISO 8601, e.g. "PT1M30S" or "PT45S"
function parseDurationSec(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const [, h, min, s] = m
  return parseInt(h ?? '0', 10) * 3600 + parseInt(min ?? '0', 10) * 60 + parseInt(s ?? '0', 10)
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// YouTube allows Shorts up to 3 minutes; without aspect-ratio data this is the
// best available signal to label a result as a Short.
const SHORTS_MAX_SEC = 180
// Videos shorter than this are almost certainly preview clips or ads — exclude.
const MIN_VIDEO_SEC = 60

type SearchCategory = 'food' | 'cafe' | 'date' | 'travel' | 'bar' | 'hotspot' | 'stay' | 'default'

// 일반 키워드("맛집")는 초경쟁이라 니치 로컬 영상이 YouTube 랭킹에서 묻힘.
// 콘텐츠 포맷 모디파이어를 붙인 보조 지역검색으로 recall 보강. 구체 키워드
// (default, 예: "김치찜")은 이미 잘 잡히므로 모디파이어 없음 → quota 절약.
const CATEGORY_MODIFIER: Record<SearchCategory, string | null> = {
  food: '먹방',
  cafe: '브이로그',
  date: '브이로그',
  travel: '브이로그',
  bar: '먹방',
  hotspot: '브이로그',
  stay: '후기',
  default: null,
}

function classifyCategory(q: string): SearchCategory {
  if (/카페|커피|브런치|디저트/.test(q)) return 'cafe'
  if (/데이트코스|데이트|커플/.test(q)) return 'date'
  if (/이자카야|포차|술집/.test(q)) return 'bar'
  if (/호텔|숙소|펜션|모텔/.test(q)) return 'stay'
  if (/핫플|명소|포토스팟|가볼만한/.test(q)) return 'hotspot'
  if (/여행|투어|관광|브이로그/.test(q)) return 'travel'
  if (/맛집|식당|음식|먹방/.test(q)) return 'food'
  return 'default'
}

function buildCategoryParams(q: string, category: SearchCategory): {
  enrichedQ: string
  order: 'relevance' | 'viewCount' | 'date'
} {
  // ★publishedAfter(게시일 필터) 제거(본부 확정, 2026-07-06). evergreen 모음/"N년간 가봤던"
  // 영상이 수집 단계에서 체계적으로 배제되던 문제(예: 서울맛집 베스트11 qFnWlbC7kHA).
  // stale 콘텐츠는 (1) 사용자 최신순 정렬 선택권 (2) 파트너 검증·카카오 원스톱(폐업 필터)로
  // 대체됨. 12/24개월 자의적 선 자체를 제거해 일관성 확보. quota 무관(파라미터일 뿐, 호출 수 불변).
  const MAP: Record<SearchCategory, { suffix: string; order: 'relevance' | 'viewCount' | 'date' }> = {
    food:    { suffix: ' 추천 리뷰',      order: 'relevance' },
    cafe:    { suffix: ' 투어 추천',      order: 'relevance' },
    date:    { suffix: ' 코스 추천 장소', order: 'viewCount' },
    travel:  { suffix: ' 브이로그 코스',  order: 'viewCount' },
    bar:     { suffix: ' 추천 분위기',    order: 'date'      },
    hotspot: { suffix: ' 추천 명소',      order: 'viewCount' },
    stay:    { suffix: ' 후기 리뷰',      order: 'relevance' },
    default: { suffix: '',                order: 'relevance' },
  }

  const cfg = MAP[category]
  return {
    enrichedQ: q + cfg.suffix,
    order: cfg.order,
  }
}

interface YTSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    channelId: string
    thumbnails: { medium: { url: string } }
  }
}

interface YTVideoItem {
  id: string
  snippet: {
    description: string
    title: string
    channelTitle: string
    channelId: string
    publishedAt?: string
    thumbnails: { medium: { url: string } }
  }
  recordingDetails?: { location?: { latitude: number; longitude: number }; locationDescription?: string }
  statistics?: { viewCount?: string }
  contentDetails?: { duration: string }
  player?: { embedWidth?: number; embedHeight?: number }
}

// YouTube's official Creator Award thresholds. Channels under 100,000
// subscribers (no award) get no badge at all.
const TIER_THRESHOLDS: { min: number; tier: SubscriberTier }[] = [
  { min: 100_000_000, tier: 'red_diamond' },
  { min: 10_000_000, tier: 'diamond' },
  { min: 1_000_000, tier: 'gold' },
  { min: 100_000, tier: 'silver' },
]

function tierForSubscriberCount(count: number): SubscriberTier | null {
  return TIER_THRESHOLDS.find((t) => count >= t.min)?.tier ?? null
}

async function getChannelSubscriberCounts(channelIds: string[]): Promise<Map<string, number>> {
  const key = process.env.YOUTUBE_API_KEY
  const uniqueIds = [...new Set(channelIds)]
  if (!key || uniqueIds.length === 0) return new Map()

  const chunks: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += 50) chunks.push(uniqueIds.slice(i, i + 50))

  const counts = new Map<string, number>()
  await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({ part: 'statistics', id: chunk.join(','), key })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, { next: { revalidate: 3600 } })
      if (!res.ok) return
      const json = await res.json() as { items?: { id: string; statistics?: { subscriberCount?: string } }[] }
      for (const item of json.items ?? []) {
        counts.set(item.id, parseInt(item.statistics?.subscriberCount ?? '0', 10))
      }
    })
  )
  return counts
}

async function ytSearch(
  q: string,
  extra: Record<string, string> = {},
  maxResults = 50
): Promise<YTSearchItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []
  const params = new URLSearchParams({
    part: 'snippet',
    ...(q ? { q } : {}),
    type: 'video',
    maxResults: String(maxResults),
    key,
    ...extra,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { next: { revalidate: 300 } })
  if (!res.ok) return []
  const json = await res.json() as { items?: YTSearchItem[] }
  return json.items ?? []
}

interface YTPlaylistItem {
  snippet?: {
    title?: string
    channelTitle?: string
    channelId?: string
    videoOwnerChannelId?: string
    videoOwnerChannelTitle?: string
    resourceId?: { videoId?: string }
    thumbnails?: { medium?: { url?: string } }
  }
}

// 채널의 전국 영상을 quota 싸게 가져온다: search.list(100유닛/50개) 대신 업로드 재생목록을
// playlistItems.list(1유닛/50개)로 페이지네이션. 결과를 YTSearchItem 모양으로 매핑해
// 기존 캐시/파이프라인과 그대로 호환. order=date의 최근 50개 쏠림 문제 해소.
async function ytChannelUploads(channelId: string, cap = MAX_CHANNEL_VIDEOS): Promise<YTSearchItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []

  // 업로드 재생목록 id (channels.list contentDetails = 1유닛, 결정적)
  const chParams = new URLSearchParams({ part: 'contentDetails', id: channelId, key })
  const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?${chParams}`, { next: { revalidate: 3600 } })
  if (!chRes.ok) return []
  const chJson = await chRes.json() as {
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[]
  }
  const uploads = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []

  const out: YTSearchItem[] = []
  let pageToken: string | undefined
  // 페이지당 1유닛. cap 도달 또는 nextPageToken 없을 때까지.
  while (out.length < cap) {
    const params = new URLSearchParams({
      part: 'snippet', playlistId: uploads, maxResults: '50', key,
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, { next: { revalidate: 3600 } })
    if (!res.ok) break
    const json = await res.json() as { items?: YTPlaylistItem[]; nextPageToken?: string }
    for (const it of json.items ?? []) {
      const videoId = it.snippet?.resourceId?.videoId
      if (!videoId) continue
      out.push({
        id: { videoId },
        snippet: {
          title: it.snippet?.title ?? '',
          channelTitle: it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? '',
          channelId: it.snippet?.videoOwnerChannelId ?? it.snippet?.channelId ?? channelId,
          thumbnails: { medium: { url: it.snippet?.thumbnails?.medium?.url ?? '' } },
        },
      })
    }
    if (!json.nextPageToken) break
    pageToken = json.nextPageToken
  }
  return out.slice(0, cap)
}

async function fetchVideoDetails(ids: string[]): Promise<YTVideoItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key || ids.length === 0) return []

  // YouTube videos.list accepts max 50 ids per call
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))

  const all = await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({
        part: 'snippet,recordingDetails,statistics,contentDetails,player',
        id: chunk.join(','),
        maxWidth: '720', // player.embedWidth/embedHeight를 반환받기 위한 필수 조건. 비율 산출용.
        key,
      })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { next: { revalidate: 300 } })
      if (!res.ok) return []
      const json = await res.json() as { items?: YTVideoItem[] }
      return json.items ?? []
    })
  )
  return all.flat()
}

// player.embedWidth/embedHeight(maxWidth 지정 시 반환)로 실제 영상 비율(w/h) 산출.
// 세로 영상이면 <1 (쇼츠·세로롱폼 ≈0.56), 가로면 ≈1.78. isShort(길이)와 독립적이라
// 세로로 찍은 롱폼도 정확히 잡는다. 치수 없으면 undefined → 클라이언트가 16:9로 폴백.
function aspectRatioOf(v: YTVideoItem): number | undefined {
  const w = v.player?.embedWidth
  const h = v.player?.embedHeight
  return w && h && h > 0 ? w / h : undefined
}

// 지리 대조: 매칭된 장소의 행정구역(시/도·시/군/구·동)이 영상 텍스트에 언급되는지.
// AI 폴백이 해외 도시명("이스탄불")을 동명 국내 식당으로 오매칭하는 것을 차단.
// 예) "서울 마포구 공덕동 476" → ["서울","마포","공덕"] 중 하나라도 텍스트에 있으면 통과.
function addressCorroborated(address: string, text: string): boolean {
  const parts = (address ?? '').split(/\s+/).slice(0, 3)
  const tokens = new Set<string>()
  for (const p of parts) {
    if (p && p.length >= 2) tokens.add(p)
    const stripped = p.replace(/(특별자치시|특별자치도|특별시|광역시|도|시|군|구|읍|면|동|리|가)$/, '')
    if (stripped.length >= 2 && stripped !== p) tokens.add(stripped)
  }
  for (const t of tokens) {
    if (text.includes(t)) return true
  }
  return false
}

// locationDescription이 순수 행정구역명(모든 토큰이 행정 접미사로 끝남)이면
// geotag 좌표가 시/군 중심점 → 정확한 위치 아님 → 제외 대상.
function isAdministrativeArea(desc: string | undefined): boolean {
  if (!desc) return false
  const tokens = desc.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) =>
    /(특별자치도|특별자치시|특별시|광역시|도|시|군|구|읍|면|동|리)$/.test(t) ||
    /-(dong|gu|si|gun|eup|myeon|ri|do)$/i.test(t)
  )
}

// 행정구역 재라우팅 가드레일 (b): 검색 카테고리별 허용 Kakao 카테고리 그룹.
// FD6=음식점, CE7=카페, AD5=숙박, AT4=관광명소, CT1=문화시설.
const CATEGORY_KAKAO_GROUP: Record<SearchCategory, string[]> = {
  food: ['FD6'],
  bar: ['FD6'],
  cafe: ['CE7'],
  date: ['FD6', 'CE7', 'AT4', 'CT1'],
  stay: ['AD5'],
  travel: ['AT4', 'CT1'],
  hotspot: ['AT4', 'CT1', 'FD6', 'CE7'],
  default: ['FD6', 'CE7'],
}

// 행정구역 재라우팅 가드레일 (a): adminDesc(원 geotag 행정구역 라벨)의 시/도·시/군/구
// 토큰이 재geocode된 주소에 모두 포함되는지. "광주광역시"→광주 내면 통과,
// "광주 동구"→광주+동구 둘 다 포함해야 통과.
function withinAdminArea(adminDesc: string, address: string): boolean {
  const tokens = adminDesc
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/특별자치도|특별자치시|특별시|광역시/g, '').replace(/^(.+?)도$/, '$1'))
    .filter((t) => t.length >= 2)
  return tokens.length > 0 && tokens.every((t) => address.includes(t))
}

function extractYoutubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null)
}

// 관리자 등록(locations+videos) + 파트너 승인 장소(places, status=active)를
// 반경 내에서 VideoResult로 변환. RLS 우회 위해 서비스롤 사용(서버 전용).
async function getRegisteredResults(lat: number, lng: number, radius: number): Promise<VideoResult[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return []
  const db = createClient(url, serviceKey)

  const out: VideoResult[] = []

  // 1) locations + videos
  const locations = await selectAllPaged('getRegisteredResults.locations', (from, to) =>
    db.from('locations').select('id, name, lat, lng, category, phone, kakao_place_id').order('id', { ascending: true }).range(from, to)
  )
  const nearby = locations.filter(
    (l) => l.lat != null && l.lng != null && haversineKm(lat, lng, l.lat, l.lng) <= radius
  )
  if (nearby.length > 0) {
    const locById = new Map(nearby.map((l) => [l.id, l]))
    // Supabase .in() 필터는 ID가 수백 개면 URL/헤더 길이 한도를 넘어 요청이 실패한다(밀집 지역에서
    // 등록장소가 통째로 0건 되던 silent failure). fetchVideoDetails(521-542)의 50개 청크 관례를 그대로
    // 미러링 — 나눠 병렬 조회하고, 청크별 error를 로깅한 뒤 실패분만 건너뛴다(throw 없음: 부분 성공 >
    // 전체 0건, 검색은 절대 안 막음). 청크는 서로 다른 location_id 부분집합이라 청크 간 중복 없음.
    const CHUNK = 50
    const locChunks: string[][] = []
    for (let i = 0; i < nearby.length; i += CHUNK) locChunks.push(nearby.slice(i, i + CHUNK).map((l) => l.id))
    const vidGroups = await Promise.all(
      locChunks.map(async (chunk, ci) => {
        const { data, error } = await db
          .from('videos')
          .select('youtube_id, title, thumbnail, channel, location_id, published_at, view_count, subscriber_count')
          .in('location_id', chunk)
        if (error) {
          console.error(`[getRegisteredResults] videos.in() 청크 실패(offset=${ci * CHUNK}, size=${chunk.length}):`, error.message)
          return []
        }
        return data ?? []
      })
    )
    for (const v of vidGroups.flat()) {
      const loc = locById.get(v.location_id)
      if (!loc || !v.youtube_id) continue
      const row = v as { published_at?: string; view_count?: number | null; subscriber_count?: number | null }
      const subs = row.subscriber_count ?? 0
      out.push({
        videoId: v.youtube_id, title: v.title ?? loc.name, thumbnail: v.thumbnail ?? '',
        channel: v.channel ?? '', lat: loc.lat, lng: loc.lng,
        distanceKm: Math.round(haversineKm(lat, lng, loc.lat, loc.lng) * 10) / 10,
        source: 'geotag', viewCount: row.view_count ?? 0, placeName: loc.name,
        placeNameSource: 'correction', duration: '', isShort: false,
        subscriberTier: tierForSubscriberCount(subs), subscriberCount: subs,
        publishedAt: row.published_at ?? undefined,
        category: (loc as { category?: string | null }).category ?? undefined, // 장소 카테고리(partner places 경로 650줄과 동일 형태). admin bulk가 locations.category에 저장.
        phone: (loc as { phone?: string | null }).phone ?? undefined, // 카드 '전화하기'용(백필/신규 데모부터 채워짐).
        kakaoPlaceId: (loc as { kakao_place_id?: string | null }).kakao_place_id ?? undefined, // 카드 카카오 상세 딥링크용(없으면 좌표 딥링크 폴백).
      })
    }
  }

  // 2) places (status=active) — 파트너 셀프 등록 장소
  const places = await selectAllPaged('getRegisteredResults.places', (from, to) =>
    db
      .from('places')
      .select('id, name, video_url, latitude, longitude, category, address, status, view_count, subscriber_count, published_at, partner_id, verification_status, phone, kakao_place_id')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, to)
  )

  // 파트너 정보(채널명·아바타·구독자수) 일괄 조회 → 금색 마커/PARTNER 배지/상위노출용.
  // ★ status='approved'만 — 아래 isPartner가 "행이 있느냐"로만 판정하므로, 이 필터가 없으면
  // 해지 tombstone(개인정보 파기됨)이나 rejected/pending 파트너의 장소가 금색 마커·PARTNER
  // 배지·상위노출을 그대로 달고 나온다. 조회에서 빠지면 partner=undefined → isPartner:false.
  const partnerIds = [...new Set(places.map((p) => (p as { partner_id?: string | null }).partner_id).filter(Boolean) as string[])]
  const partnerMap = new Map<string, { channel_name: string; avatar_url: string | null; subscriber_count: number | null }>()
  if (partnerIds.length > 0) {
    // 위 videos 조회와 동일 — partnerIds도 밀집 시 커질 수 있어 청크 분할 + error 로깅(실패분만 skip).
    const CHUNK = 50
    const pChunks: string[][] = []
    for (let i = 0; i < partnerIds.length; i += CHUNK) pChunks.push(partnerIds.slice(i, i + CHUNK))
    const partnerGroups = await Promise.all(
      pChunks.map(async (chunk, ci) => {
        const { data, error } = await db
          .from('partners')
          .select('id, channel_name, avatar_url, subscriber_count')
          .eq('status', 'approved')
          .in('id', chunk)
        if (error) {
          console.error(`[getRegisteredResults] partners.in() 청크 실패(offset=${ci * CHUNK}, size=${chunk.length}):`, error.message)
          return []
        }
        return data ?? []
      })
    )
    for (const pt of partnerGroups.flat()) partnerMap.set(pt.id, pt)
  }

  for (const p of places ?? []) {
    if (p.latitude == null || p.longitude == null) continue
    const dist = haversineKm(lat, lng, p.latitude, p.longitude)
    if (dist > radius) continue
    const vid = extractYoutubeId(p.video_url ?? '')
    if (!vid) continue
    const pr = p as { view_count?: number | null; subscriber_count?: number | null; published_at?: string | null; partner_id?: string | null; address?: string | null; category?: string | null; verification_status?: string | null; phone?: string | null; kakao_place_id?: string | null }
    const partner = pr.partner_id ? partnerMap.get(pr.partner_id) : undefined
    const subs = partner?.subscriber_count ?? pr.subscriber_count ?? 0
    out.push({
      videoId: vid, title: p.name, thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
      channel: partner?.channel_name ?? p.category ?? '', lat: p.latitude, lng: p.longitude,
      distanceKm: Math.round(dist * 10) / 10,
      source: 'geotag', viewCount: pr.view_count ?? 0, placeName: p.name,
      placeNameSource: 'correction', duration: '', isShort: false,
      subscriberTier: tierForSubscriberCount(subs), subscriberCount: subs,
      publishedAt: pr.published_at ?? undefined,
      isPartner: !!partner,
      partnerThumbnail: partner?.avatar_url ?? null,
      placeId: (p as { id?: string }).id, // 계측(/api/track)이 "어느 places 행에서 영상 유입인지" 식별용. places 경로에만 실림(admin locations/videos 경로엔 없음).
      verificationStatus: (pr.verification_status ?? undefined) as VideoResult['verificationStatus'], // 파트너 confirm 장소만 'confirmed'. 상세 카드 확인 배지용. admin locations 경로엔 없음.
      address: pr.address ?? undefined, // 상세 카드용. admin locations 경로엔 없음.
      category: pr.category ?? undefined, // 장소 카테고리(channel 폴백과 별개로 독립 노출용).
      phone: pr.phone ?? undefined, // 카드 '전화하기'용(값 있을 때만 버튼).
      kakaoPlaceId: pr.kakao_place_id ?? undefined, // 카드 카카오 상세 딥링크용(없으면 좌표 딥링크 폴백).
    })
  }

  // 병합/중복 처리 — 키 = videoId + 정규화 장소명. (좌표 키 폐기: admin 수기 좌표와 파트너
  // 지오코딩 좌표가 미세하게 달라 "같은 장소"를 놓치고 중복 표시하던 문제 해소.)
  // 같은 키에 admin(locations)·partner(places)가 함께 오면 필드별로 머지한다.
  // 이름이 다르면(예: "양림빵집" vs "양림빵집 본점") 키가 달라 각각 유지(정상).
  const byKey = new Map<string, VideoResult>()
  for (const r of out) {
    const key = `${r.videoId}:${normName(r.placeName ?? r.title)}`
    const prev = byKey.get(key)
    byKey.set(key, prev ? mergeRegistered(prev, r) : r)
  }
  const finalOut = [...byKey.values()]

  // 등록장소(locations/places)엔 description이 없어 순수검색의 챕터/타임스탬프 기반
  // isCompilationVideo 판정을 못 쓴다 — 대신 같은 videoId가 2곳 이상(dedup 후)이면
  // "이 영상은 장소 여럿을 다룬다"는 개수 기반 판정으로 isCompilation을 부여한다.
  // ("영상 장소 전체 보기" 버튼 노출용, 표시 전용 — 반경/정렬/dedup 로직엔 영향 없음.)
  const countByVideo = new Map<string, number>()
  for (const r of finalOut) countByVideo.set(r.videoId, (countByVideo.get(r.videoId) ?? 0) + 1)
  for (const r of finalOut) {
    if ((countByVideo.get(r.videoId) ?? 0) >= 2) r.isCompilation = true
  }

  return finalOut
}

// admin locations 결과와 partner places 결과가 "같은 장소"(videoId+정규화명 일치)로 겹칠 때 하나로 합친다.
// 소스 판별은 placeId 유무(places 경로에만 실림)로 — 인자 순서에 무관하게 동작.
// 규칙: 파트너 권위 필드(verificationStatus/isPartner/partnerThumbnail/placeId/address)=places 값 사용,
//       큐레이션 필드(lat/lng/placeName/category)=admin 값이 있으면 admin 우선, 없으면 places 값.
function mergeRegistered(a: VideoResult, b: VideoResult): VideoResult {
  const nonEmpty = (v?: string | null): string | undefined => (v != null && v.trim() !== '') ? v : undefined
  const aIsPlaces = a.placeId != null
  const bIsPlaces = b.placeId != null

  // 같은 소스끼리 겹침(admin+admin 또는 places+places): 기존 "먼저 것 유지" + 빈 값만 보완.
  if (aIsPlaces === bIsPlaces) {
    return {
      ...a,
      placeName: nonEmpty(a.placeName) ?? b.placeName,
      category: nonEmpty(a.category) ?? b.category,
      address: nonEmpty(a.address) ?? b.address,
      partnerThumbnail: a.partnerThumbnail ?? b.partnerThumbnail,
      placeId: a.placeId ?? b.placeId,
      verificationStatus: a.verificationStatus ?? b.verificationStatus,
      isPartner: a.isPartner || b.isPartner,
      phone: nonEmpty(a.phone) ?? b.phone,                       // 병합 시 소실 방지(carry)
      kakaoPlaceId: nonEmpty(a.kakaoPlaceId) ?? b.kakaoPlaceId,  // 병합 시 소실 방지(carry)
    }
  }

  const admin = aIsPlaces ? b : a
  const partner = aIsPlaces ? a : b
  return {
    ...partner, // 파트너 권위 필드 베이스(verificationStatus/isPartner/partnerThumbnail/placeId/address 포함)
    lat: admin.lat,               // 등록 결과는 항상 좌표 있음 → admin 수기 좌표 우선
    lng: admin.lng,
    distanceKm: admin.distanceKm, // 좌표를 admin 것으로 채택 → 거리도 admin 기준
    placeName: nonEmpty(admin.placeName) ?? partner.placeName, // 큐레이션명 우선, 없으면 partner
    category: nonEmpty(admin.category) ?? partner.category,     // admin category 있으면 우선, 없으면 partner
  }
}

// 얇은 최상위 래퍼 — 핸들러 본문에서 어떤 예외가 새도 본문 없는 500(Content-Length 0)
// 대신 유효한 JSON을 돌려준다. 프론트가 res.json()을 무조건 호출하므로, 빈 응답은
// "Unexpected end of JSON input"이라는 무의미한 클라이언트 에러로 둔갑해 원인 추적을
// 막았다. console.error로 스택을 남겨 서버 로그에서 실제 원인이 보이게 한다.
// 성공 경로는 그대로 통과 — 정상 응답 동작은 바뀌지 않는다.
export async function GET(req: NextRequest) {
  try {
    return await handleSearch(req)
  } catch (e) {
    console.error('[api/search] unhandled error', e)
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }
}

async function handleSearch(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim()
  const channelId = searchParams.get('channelId')?.trim() || undefined
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const radius = parseFloat(searchParams.get('radius') ?? '5')
  // 채널 검색은 그 창작자의 전국 장소를 다 보여줘야 하므로 반경 거리필터를 끈다(Infinity).
  // distanceKm 값 자체는 표시용으로 계속 계산됨. 키워드는 distanceLimit === radius라 동작 불변.
  const distanceLimit = channelId ? Infinity : radius

  if ((!q && !channelId) || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'q (or channelId), lat, lng are required' }, { status: 400 })
  }

  // 검색 중심의 시/군/구 지역명 — "지역+키워드" 유튜브 검색과 비-geotag 위치 추출
  // 휴리스틱 양쪽에서 재사용. Kakao 호출(YT quota 무관)이므로 한 번만 계산.
  const regionName = await getRegionName(lat, lng)
  // 대도시 구(서구/동구/광산구…)는 전국 동명 구가 많아 geocode 모호 → 검색 중심의 도시명을
  // 쿼리 앞에 붙여 해소("서구 진심옥"→"광주 서구 진심옥"). 비-대도시(도 단위)는 ''. GET당 1회만 계산.
  const cityPrefix = await getCityName(lat, lng)
  const geoRegionPrefix = cityPrefix ? `${cityPrefix} ` : ''
  // 채널 검색은 전국 영상이라 검색중심(예 "광주") 지역으로 장소추출을 앵커링하면 안 됨
  // (군산 영상의 장소가 "광주 ○○"로 지오코딩→영상텍스트와 불일치→전부 탈락). 채널 모드는
  // 앵커를 비워 각 영상의 제목/설명 텍스트로 해석하게 한다. 키워드는 기존 앵커 유지.
  const effGeoRegionPrefix = channelId ? '' : geoRegionPrefix
  const effRegionName = channelId ? null : regionName
  // 검색 카테고리 — 후보 풀 구성과 행정구역 재라우팅 카테고리 가드레일에서 공용.
  const category: SearchCategory = q ? classifyCategory(q) : 'default'

  // Fallback searches ("broad KR", then "여행") only fire when the cheaper
  // search before them didn't return enough candidates, to keep quota usage
  // down without hurting coverage for popular keywords.
  const MIN_CANDIDATES_BEFORE_FALLBACK = 15

  const seen = new Set<string>()
  const dedupe = (items: YTSearchItem[]) =>
    items.filter((item) => {
      if (seen.has(item.id.videoId)) return false
      seen.add(item.id.videoId)
      return true
    })

  // Reuse cached results for the same query/channel instead of re-querying.
  // 채널은 위치 무관 키 + 긴 TTL(카탈로그 안정적), 키워드는 ~1km 그리드 + 20분.
  const cacheKey = searchCacheKey(q, channelId, lat, lng)
  let unique = await getCachedSearchItems(cacheKey, channelId ? CHANNEL_CACHE_TTL_MS : undefined)

  if (!unique) {
    if (channelId) {
      // 한 창작자의 전국 영상을 다 보여줌. 업로드 재생목록(playlistItems, 50개당 1유닛)으로
      // 전체를 가져옴 — 기존 search.list(order=date, 50개)는 최근 영상에 쏠려 전국이 안 떴음.
      // location 파라미터 없음(비-geotag 업로드도 포함, 거리필터는 다운스트림에서 끔).
      const channelItems = await ytChannelUploads(channelId)
      unique = dedupe(channelItems)
    } else {
      // ★rate limit — 캐시 미스 + 키워드검색(q)에서만 도달(캐시 히트/채널검색은 여기 안 옴 → 자동 면제).
      // 로그인은 user_id, 익명은 IP 해시 기준. 초과 시 429. fail-open이라 DB 오류엔 통과.
      const supabaseAuth = await createServerClient()
      const { data: { user: rlUser } } = await supabaseAuth.auth.getUser()
      const { limited, retryAfterSec } = await checkKeywordRateLimit(req, rlUser?.id ?? null)
      if (limited) {
        return NextResponse.json(
          { error: 'rate_limited', retryAfterSec },
          { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
        )
      }

      const { enrichedQ, order: catOrder } = buildCategoryParams(q!, category)

      const geoItems = await ytSearch(enrichedQ, {
        location: `${lat},${lng}`,
        locationRadius: `${radius}km`,
      })
      unique = dedupe(geoItems)

      // 지역명 + 키워드 텍스트 검색 — geotag 없는 로컬 영상을 후보 풀에 포함.
      // location 파라미터를 빼야 비-geotag 영상도 반환됨(YouTube 동작). 항상 실행.
      // 앵커는 도시명 prefix를 붙인 searchRegion(예: "광주 동구"). 대도시 구(동구/서구/남구/북구/중구…)는
      // 전국 동명이라 regionName만으론 모호("동구 맛집"→전국 동구 긁어옴→거리필터 전멸). geoRegionPrefix는
      // 위에서 이미 계산됨(대도시면 "광주 ", 도 단위면 ''). 도 단위는 regionName이 고유 시/군명이라 그대로.
      const searchRegion = `${geoRegionPrefix}${regionName ?? ''}`.trim()
      if (searchRegion) {
        const regionItems = await ytSearch(`${searchRegion} ${q}`, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: 'relevance',
        })
        unique = [...unique, ...dedupe(regionItems)]

        // 일반 키워드(food/cafe 등)는 콘텐츠 포맷 모디파이어를 붙인 보조 지역검색으로
        // 니치 로컬 영상 recall 보강 (예: "가평 맛집 먹방"). default 카테고리는 생략.
        const modifier = CATEGORY_MODIFIER[category]
        if (modifier) {
          const modItems = await ytSearch(`${searchRegion} ${q} ${modifier}`, {
            relevanceLanguage: 'ko',
            regionCode: 'KR',
            order: 'relevance',
          })
          unique = [...unique, ...dedupe(modItems)]
        }
      }

      if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
        const broadItems = await ytSearch(enrichedQ, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: catOrder,
        })
        unique = [...unique, ...dedupe(broadItems)]
      }

      if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
        const travelItems = await ytSearch(`${q} 여행`, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: 'viewCount',
        }, 30)
        unique = [...unique, ...dedupe(travelItems)]
      }
    }
    await setCachedSearchItems(cacheKey, unique)
  }

  const [details, corrections, subscriberCounts, minConfidence] = await Promise.all([
    fetchVideoDetails(unique.map((i) => i.id.videoId)),
    getLocationCorrections(),
    getChannelSubscriberCounts(unique.map((i) => i.snippet.channelId)),
    getMinConfidenceSetting(),
  ])

  // L7 퍼널 계측 카운터 — 각 단계 통과 수만 누적한다(검색/추출/dedup 로직은 무수정, 카운트만 읽음).
  // collected/extractTargets는 영상 단위, extractedOk/radiusPass/displayed는 해석(장소) 단위
  // (모음영상 1개가 여러 장소를 냄) — before 스냅샷은 비율로 해석한다.
  const funnel = { collected: unique.length, extractTargets: 0, extractedOk: 0, radiusPass: 0, displayed: 0 }

  const results: VideoResult[] = []

  // 영상 3분할:
  // - geoValid: 좌표 있고 (보정 있음 OR 비-행정구역) → geotag 직접 사용
  // - adminGeo: 좌표 있으나 순수 행정구역(중심점) + 보정없음 → 추출 재라우팅(가드레일)
  // - noGeo: 좌표 없음 → 추출
  const hasGeo = (v: YTVideoItem) => Boolean(v.recordingDetails?.location?.latitude)
  const isAdminGeo = (v: YTVideoItem) =>
    hasGeo(v) && !corrections.get(v.id) && isAdministrativeArea(v.recordingDetails?.locationDescription)
  const geoValid = details.filter((v) => hasGeo(v) && !isAdminGeo(v))
  const adminGeo = details.filter(isAdminGeo)
  const noGeo = details.filter((v) => !hasGeo(v))
  // ② 추출 대상 영상 수: geoValid + adminGeo 전량 + noGeo(캡 slice 적용분).
  funnel.extractTargets = geoValid.length + adminGeo.length + Math.min(noGeo.length, channelId ? MAX_CHANNEL_VIDEOS : 40)

  await Promise.all([
    // Geo-tagged: fast path
    ...geoValid
      .map(async (v) => {
        funnel.extractedOk++ // geotag 영상은 좌표 내장 → 지오코딩 성공에 준함
        const correction = corrections.get(v.id)
        const original = v.recordingDetails!.location!
        const pointLat = correction?.lat ?? original.latitude
        const pointLng = correction?.lng ?? original.longitude
        const dist = haversineKm(lat, lng, pointLat, pointLng)
        if (dist <= distanceLimit) {
          funnel.radiusPass++
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const statedName = extractStatedBusinessName(v.snippet.title, v.snippet.description ?? '')
          // 창작자가 geotag에 단 위치 라벨 — 비-행정구역이면 그대로 상호명("창억떡집 중흥본점")
          const locDesc = v.recordingDetails?.locationDescription?.trim()
          const usableLocDesc = locDesc && !isAdministrativeArea(locDesc) ? locDesc : null
          let placeName: string | undefined
          let placeNameSource: PlaceNameSource
          // 순수검색 원스톱: searchPlaceInfo가 준 phone/kakaoPlaceId/category를 카드까지 전달(미저장·표시전용).
          let placePhone: string | undefined
          let placeKakaoId: string | undefined
          let placeCategory: string | undefined
          if (correction?.placeName) {
            placeName = correction.placeName
            placeNameSource = 'correction'
          } else if (usableLocDesc) {
            placeName = usableLocDesc
            placeNameSource = 'explicit_description'
          } else if (statedName) {
            placeName = statedName
            placeNameSource = 'explicit_description'
          } else {
            const [address, titleMatch] = await Promise.all([
              correction?.address ? Promise.resolve(correction.address) : reverseGeocode(pointLat, pointLng),
              searchPlaceInfo(snippet.title, pointLat, pointLng),
            ])
            // 주소 문자열로 Kakao 검색하면 동일 주소의 무관한 업체(법률사무소 등)가 잡혀
            // 오명을 만들므로 address_match fallback은 사용하지 않음. 제목 매칭 실패 시
            // 맨 주소(address_fallback)를 노출한다.
            placeName = titleMatch?.name || address || undefined
            placeNameSource = titleMatch?.name ? 'title_match' : 'address_fallback'
            placePhone = titleMatch?.phone
            placeKakaoId = titleMatch?.kakaoPlaceId
            placeCategory = titleMatch?.category
          }
          logPlaceNameResolution(v.id, placeNameSource, placeName)
          if (!meetsConfidence(placeNameSource, minConfidence)) return
          const durationSec = parseDurationSec(v.contentDetails?.duration ?? '')
          if (durationSec > 0 && durationSec < MIN_VIDEO_SEC) return
          results.push({
            videoId: v.id,
            title: snippet.title,
            thumbnail: snippet.thumbnails.medium.url,
            channel: snippet.channelTitle,
            lat: pointLat,
            lng: pointLng,
            distanceKm: Math.round(dist * 10) / 10,
            source: 'geotag',
            viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
            placeName,
            placeNameSource,
            duration: formatDuration(durationSec),
            isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
            aspectRatio: aspectRatioOf(v),
            subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
            subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
            publishedAt: v.snippet.publishedAt,
            phone: placePhone,
            kakaoPlaceId: placeKakaoId,
            category: placeCategory,
          })
        }
}),

    // 비-geotag 추출(첫 40개) + 행정구역 geotag 재라우팅(adminDesc 있으면 가드레일 적용).
    // adminGeo는 centroid 좌표를 버리고 제목 추출로 실제 장소를 재산출한다.
    ...[
      // 채널 모드는 전국 비-geotag(모음/설명란) 영상도 다 추출해야 전국이 뜸 → 캡 상향.
      ...noGeo.slice(0, channelId ? MAX_CHANNEL_VIDEOS : 40).map((v) => ({ v, adminDesc: null as string | null })),
      ...adminGeo.map((v) => ({ v, adminDesc: v.recordingDetails?.locationDescription?.trim() ?? null })),
    ].map(async ({ v, adminDesc }) => {
      const correction = corrections.get(v.id)
      if (correction) {
        funnel.extractedOk++ // 관리자 보정 좌표 보유 → 지오코딩 성공에 준함
        const dist = haversineKm(lat, lng, correction.lat, correction.lng)
        if (dist <= distanceLimit) {
          funnel.radiusPass++
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const statedName = extractStatedBusinessName(v.snippet.title, v.snippet.description ?? '')
          let placeName: string | undefined
          let placeNameSource: PlaceNameSource
          let placePhone: string | undefined
          let placeKakaoId: string | undefined
          let placeCategory: string | undefined
          if (correction.placeName) {
            placeName = correction.placeName
            placeNameSource = 'correction'
          } else if (statedName) {
            placeName = statedName
            placeNameSource = 'explicit_description'
          } else {
            const titleMatch = await searchPlaceInfo(snippet.title, correction.lat, correction.lng)
            // address_match fallback 미사용(동일 주소 무관 업체 오매칭 방지).
            placeName = titleMatch?.name || correction.address || undefined
            placeNameSource = titleMatch?.name ? 'title_match' : 'address_fallback'
            placePhone = titleMatch?.phone
            placeKakaoId = titleMatch?.kakaoPlaceId
            placeCategory = titleMatch?.category
          }
          logPlaceNameResolution(v.id, placeNameSource, placeName)
          if (meetsConfidence(placeNameSource, minConfidence)) {
            const durationSec = parseDurationSec(v.contentDetails?.duration ?? '')
            if (!(durationSec > 0 && durationSec < MIN_VIDEO_SEC)) results.push({
              videoId: v.id,
              title: snippet.title,
              thumbnail: snippet.thumbnails.medium.url,
              channel: snippet.channelTitle,
              lat: correction.lat,
              lng: correction.lng,
              distanceKm: Math.round(dist * 10) / 10,
              source: 'ai',
              viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
              placeName,
              placeNameSource,
              duration: formatDuration(durationSec),
              isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
              aspectRatio: aspectRatioOf(v),
              subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
              subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
              publishedAt: v.snippet.publishedAt,
              phone: placePhone,
              kakaoPlaceId: placeKakaoId,
              category: placeCategory,
            })
          }
        }
        return
      }

      // 지역 앵커 휴리스틱으로 좌표를 찾고, 반경 내면 결과로 추가. 성공 시 true.
      // requireCorroboration=true(AI 폴백)면 매칭 장소 행정구역이 영상 텍스트에
      // 언급될 때만 통과 — 해외 도시명 동명 오매칭 차단.
      const tryResolveAndPush = async (place: string, requireCorroboration: boolean, businessHint?: string): Promise<boolean> => {
        // 휴리스틱 쿼리(requireCorroboration=false)에만 도시명 prefix로 대도시 구 모호성 해소.
        // AI 쿼리(=true)는 이미 자체 지역명을 포함하므로 prefix 안 함(중복 방지).
        const geo2 = await geocodeKorean(requireCorroboration ? place : `${effGeoRegionPrefix}${place}`.trim())
        if (!geo2) return false

        // 카카오 결과 교차검증 — 우리가 찾던 상호명이 카카오가 돌려준 place_name에 실제로
        // 들어 있는지 확인한다. 쿼리가 상호명이 아니라 음식명·업종·행정동명이면
        // ("대구 뭉티기", "서울시 중구 분식집", "제주도 호근동") 카카오는 그 근처 아무 업체나
        // 돌려주는데, 이름이 겹치지 않으므로 여기서 걸러진다. 지점명이 붙은 정상 매칭
        // ("다사랑치킨" → "다사랑치킨피자 원대본점")은 부분포함이라 통과한다
        // (nameInText가 공백·특수문자를 무시하고 비교). 입력을 사전으로 판별하지 않고
        // 출력을 검증하는 방식이라 음식명 목록을 유지할 필요가 없다.
        const bizCandidates = businessHint
          ? [businessHint]
          // 휴리스틱 쿼리는 business가 분리돼 있지 않아 뒤쪽 토큰들을 후보로 삼는다.
          : (() => {
              const t = place.split(/\s+/).filter(Boolean)
              return [1, 2, 3].filter((k) => k <= t.length).map((k) => t.slice(-k).join(' '))
            })()
        if (!bizCandidates.some((c) => nameInText(c, geo2.name))) return false
        funnel.extractedOk++ // 상호명 지오코딩 성공(휴리스틱/AI 후보 단위 — 재시도 시 중복 가능)
        const dist = haversineKm(lat, lng, geo2.lat, geo2.lng)
        if (dist > distanceLimit) return false
        funnel.radiusPass++

        if (requireCorroboration) {
          const videoText = `${v.snippet.title} ${v.snippet.description ?? ''}`
          if (!addressCorroborated(geo2.address, videoText)) return false
        }

        // 행정구역 재라우팅 가드레일: centroid 버리고 재geocode한 결과가
        // (a) 원 행정구역 내 + (b) 검색 카테고리와 일치할 때만 채택. 하나라도 실패→제외.
        if (adminDesc) {
          if (!withinAdminArea(adminDesc, geo2.address)) return false
          if (!CATEGORY_KAKAO_GROUP[category].includes(geo2.categoryGroup)) return false
        }

        const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
        const statedName = extractStatedBusinessName(v.snippet.title, v.snippet.description ?? '')
        let resolvedName: string
        let placeNameSource: PlaceNameSource
        // 순수검색 원스톱: 기본은 geo2(geocodeKorean)의 phone/id/category, else 분기는 searchPlaceInfo 우선(미저장·표시전용).
        let placePhone: string | undefined = geo2.phone
        let placeKakaoId: string | undefined = geo2.kakaoPlaceId
        let placeCategory: string | undefined = geo2.category
        if (statedName) {
          resolvedName = statedName
          placeNameSource = 'explicit_description'
        } else if (geo2.name) {
          // geocodeKorean이 휴리스틱/AI 쿼리로 이미 매칭한 장소명을 그대로 사용.
          // (address_match처럼 주소로 재검색하지 않으므로 무관 업체 오매칭 없음)
          resolvedName = geo2.name
          placeNameSource = 'title_match'
        } else {
          const titleMatch = await searchPlaceInfo(snippet.title, geo2.lat, geo2.lng)
          // address_match fallback 미사용(동일 주소 무관 업체 오매칭 방지).
          resolvedName = titleMatch?.name || geo2.address
          placeNameSource = titleMatch?.name ? 'title_match' : 'address_fallback'
          placePhone = titleMatch?.phone ?? geo2.phone
          placeKakaoId = titleMatch?.kakaoPlaceId ?? geo2.kakaoPlaceId
          placeCategory = titleMatch?.category ?? geo2.category
        }
        logPlaceNameResolution(v.id, placeNameSource, resolvedName)
        if (!meetsConfidence(placeNameSource, minConfidence)) return false
        const durationSec = parseDurationSec(v.contentDetails?.duration ?? '')
        if (durationSec > 0 && durationSec < MIN_VIDEO_SEC) return false
        results.push({
          videoId: v.id,
          title: snippet.title,
          thumbnail: snippet.thumbnails.medium.url,
          channel: snippet.channelTitle,
          lat: geo2.lat,
          lng: geo2.lng,
          distanceKm: Math.round(dist * 10) / 10,
          source: 'ai',
          viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
          placeName: resolvedName,
          placeNameSource,
          duration: formatDuration(durationSec),
          isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
          aspectRatio: aspectRatioOf(v),
          subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
          subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
          publishedAt: v.snippet.publishedAt,
          phone: placePhone,
          kakaoPlaceId: placeKakaoId,
          category: placeCategory,
        })
        return true
      }

      if (isCompilationVideo(v.snippet.title, v.snippet.description ?? '')) {
        const allowedGroups = CATEGORY_KAKAO_GROUP[category] ?? CATEGORY_KAKAO_GROUP.default
        const resolved = await resolveCompilationPlaces({
          videoId: v.id,
          title: v.snippet.title,
          description: v.snippet.description ?? '',
          // geocode 쿼리용으로 도시명 prefix 부착(함수 본문 무수정 — regionName은 거기서 쿼리에만 쓰임)
          regionName: `${effGeoRegionPrefix}${effRegionName ?? ''}`.trim() || null, lat, lng, radius: distanceLimit,
          adminDesc,            // 이 영상의 adminDesc (없으면 null)
          allowedGroups,
          withinAdminArea,      // 기존 route 내 함수/헬퍼 그대로 전달
          addressCorroborated,  // 기존 route 내 함수/헬퍼 그대로 전달
          funnel,               // L7 계측 — 장소 단위 extractedOk/radiusPass 누적(로직 무영향)
        })
        const durationSec = parseDurationSec(v.contentDetails?.duration ?? '')
        if (!(durationSec > 0 && durationSec < MIN_VIDEO_SEC)) {
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          for (const r of resolved) {
            logPlaceNameResolution(v.id, 'explicit_description', r.name)
            results.push({
              videoId: v.id, title: snippet.title,
              thumbnail: snippet.thumbnails.medium.url,
              channel: snippet.channelTitle,
              lat: r.lat, lng: r.lng, distanceKm: r.distanceKm,
              source: 'ai',
              viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
              placeName: r.name, placeNameSource: 'explicit_description',
              duration: formatDuration(durationSec),
              isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
              aspectRatio: aspectRatioOf(v),
              subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
              subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
              startSec: r.startSec,
              publishedAt: v.snippet.publishedAt,
              isCompilation: true, // 모음영상 → 카드 "장소 전체 보기" 진입점 노출용(표시 전용)
              phone: r.phone,
              kakaoPlaceId: r.kakaoPlaceId,
              category: r.category,
            })
          }
        }
        return
      }

      // ① 휴리스틱 우선 (지역 앵커 + 명시 업체명) — API 비용 없음
      const candidates = buildHeuristicPlaceQueries(v.snippet.title, v.snippet.description ?? '', effRegionName)
      let resolved = false
      for (const place of candidates) {
        if (await tryResolveAndPush(place, false)) { resolved = true; break }
      }
      // ② 휴리스틱 실패 시에만 AI 폴백 (videoId 캐시로 반복 호출 차단)
      // AI 결과는 지리 대조(requireCorroboration=true) 통과 시에만 채택.
      if (!resolved) {
        const aiQuery = await extractPlaceByAI(v.id, v.snippet.title, v.snippet.description ?? '')
        if (aiQuery) await tryResolveAndPush(aiQuery.query, true, aiQuery.business)
      }
    }),
  ])

  // Deduplicate results by videoId+location (race condition in parallel map; one
  // compilation video yields multiple places), sort by viewCount desc
  const finalSeen = new Set<string>()
  const deduped = results.filter((r) => {
    const key = `${r.videoId}:${r.lat.toFixed(3)}:${r.lng.toFixed(3)}`
    if (finalSeen.has(key)) return false
    finalSeen.add(key)
    return true
  })
  const [blocked, myHidden] = await Promise.all([getBlockedVideoIds(), getMyHiddenVideoIds()])
  const filtered = deduped.filter((r) => !blocked.has(r.videoId) && !myHidden.has(r.videoId))
  filtered.sort((a, b) => b.viewCount - a.viewCount)
  funnel.displayed = filtered.length // ⑤ 파이프라인 최종 표시 행(등록 병합 전)

  // 등록 장소(관리자/파트너)는 큐레이션된 데이터이므로 상단에 배치.
  // YouTube 결과와 videoId 중복 시 등록본 우선.
  // 채널 검색 결과엔 그 채널 영상만 남겨야 함 — 등록 장소(관리자/파트너)는 채널 정보가 없어 제외.
  const registered = channelId ? [] : await getRegisteredResults(lat, lng, radius)
  const regSeen = new Set(registered.map((r) => r.videoId))
  const finalResults = [...registered, ...filtered.filter((r) => !regSeen.has(r.videoId))]

  // L7 퍼널 기록 — 응답 직전 1회. await하되 내부에서 실패를 삼켜 검색을 막지 않는다
  // (서버리스에서 미await 시 insert가 유실될 수 있어 await로 기록 보장). 검색어 원문 + region(시/군/구)만.
  await logSearchFunnel({
    query: q ?? null,
    searchType: channelId ? 'channel' : 'keyword',
    region: regionName ?? null,
    category,
    radius: channelId ? null : radius,
    collected: funnel.collected,
    extractTargets: funnel.extractTargets,
    extractedOk: funnel.extractedOk,
    radiusPass: funnel.radiusPass,
    displayed: funnel.displayed,
    registeredMerged: registered.length,
  })

  return NextResponse.json({ results: finalResults })
}
