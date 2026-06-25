import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { haversineKm } from '@/lib/haversine'
import { geocodeKorean, reverseGeocode, searchPlaceInfo, getRegionName } from '@/lib/geocode'
import { buildHeuristicPlaceQueries, extractPlaceByAI, extractExplicitBusinessName } from '@/lib/extractLocation'
import { extractPlaceFromComments } from '@/lib/extractFromComments'
import { getMinConfidenceSetting } from '@/app/actions'

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
  const { data } = await supabase.from('location_reports').select('video_id, reason, is_admin_report')
  if (!data) return new Set()

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
  const { data } = await supabase.from('location_corrections').select('video_id, lat, lng, address, place_name')
  if (!data) return new Map()

  return new Map(data.map((row) => [row.video_id, { lat: row.lat, lng: row.lng, address: row.address, placeName: row.place_name }]))
}

// Caches raw search.list results (the expensive 100-quota-unit call) per
// query/channel + ~1km location grid, so repeated searches — e.g. a user just
// changing the radius slider — reuse the same YouTube results instead of
// re-querying. videos.list/channels.list aren't cached since they're cheap.
const SEARCH_CACHE_TTL_MS = 20 * 60 * 1000

function searchCacheKey(q: string | undefined, channelId: string | undefined, lat: number, lng: number): string {
  const latR = Math.round(lat * 100) / 100
  const lngR = Math.round(lng * 100) / 100
  return channelId ? `ch:${channelId}:${latR}:${lngR}` : `q:${(q ?? '').toLowerCase().trim()}:${latR}:${lngR}`
}

async function getCachedSearchItems(key: string): Promise<YTSearchItem[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createClient(url, anonKey)
  const { data } = await supabase.from('search_cache').select('payload, created_at').eq('key', key).maybeSingle()
  if (!data) return null
  if (Date.now() - new Date(data.created_at).getTime() > SEARCH_CACHE_TTL_MS) return null
  return data.payload as YTSearchItem[]
}

async function setCachedSearchItems(key: string, items: YTSearchItem[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return

  const supabase = createClient(url, anonKey)
  await supabase
    .from('search_cache')
    .upsert({ key, payload: items, created_at: new Date().toISOString() })
    .then(() => {}, () => {})
}

export type SubscriberTier = 'silver' | 'gold' | 'diamond' | 'red_diamond'

// How confident we are in placeName, from most to least reliable. Logged per
// video so accuracy can be measured later (e.g. cross-referenced against
// "주소가 정확하지 않아요" reports) instead of just guessing where to improve.
export type PlaceNameSource =
  | 'explicit_description'
  | 'title_match'
  | 'address_match'
  | 'comment_match'
  | 'address_fallback'
  | 'correction'

// Most to least reliable. Used to decide which placeName sources are
// trustworthy enough to display — admin-configurable via app_settings, see
// getMinConfidenceSetting().
const SOURCE_RANK: PlaceNameSource[] = [
  'correction',
  'explicit_description',
  'title_match',
  'address_match',
  'comment_match',
  'address_fallback',
]

function meetsConfidence(source: PlaceNameSource, minSource: PlaceNameSource): boolean {
  return SOURCE_RANK.indexOf(source) <= SOURCE_RANK.indexOf(minSource)
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
  subscriberTier: SubscriberTier | null
  subscriberCount: number
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
  publishedAfter: string
  order: 'relevance' | 'viewCount' | 'date'
} {
  const now = new Date()
  const monthsAgo = (n: number) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - n)
    return d.toISOString()
  }

  const MAP: Record<SearchCategory, { suffix: string; months: number; order: 'relevance' | 'viewCount' | 'date' }> = {
    food:    { suffix: ' 추천 리뷰',      months: 12, order: 'relevance' },
    cafe:    { suffix: ' 투어 추천',      months: 6,  order: 'relevance' },
    date:    { suffix: ' 코스 추천 장소', months: 12, order: 'viewCount' },
    travel:  { suffix: ' 브이로그 코스',  months: 24, order: 'viewCount' },
    bar:     { suffix: ' 추천 분위기',    months: 12, order: 'date'      },
    hotspot: { suffix: ' 추천 명소',      months: 6,  order: 'viewCount' },
    stay:    { suffix: ' 후기 리뷰',      months: 12, order: 'relevance' },
    default: { suffix: '',                months: 12, order: 'relevance' },
  }

  const cfg = MAP[category]
  return {
    enrichedQ: q + cfg.suffix,
    publishedAfter: monthsAgo(cfg.months),
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
    thumbnails: { medium: { url: string } }
  }
  recordingDetails?: { location?: { latitude: number; longitude: number }; locationDescription?: string }
  statistics?: { viewCount?: string }
  contentDetails?: { duration: string }
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

async function fetchVideoDetails(ids: string[]): Promise<YTVideoItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key || ids.length === 0) return []

  // YouTube videos.list accepts max 50 ids per call
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))

  const all = await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({
        part: 'snippet,recordingDetails,statistics,contentDetails',
        id: chunk.join(','),
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
  return tokens.every((t) => /(특별자치도|특별자치시|특별시|광역시|도|시|군|구|읍|면|동|리)$/.test(t))
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
  const { data: locations } = await db.from('locations').select('id, name, lat, lng')
  const nearby = (locations ?? []).filter(
    (l) => l.lat != null && l.lng != null && haversineKm(lat, lng, l.lat, l.lng) <= radius
  )
  if (nearby.length > 0) {
    const { data: vids } = await db
      .from('videos')
      .select('youtube_id, title, thumbnail, channel, location_id')
      .in('location_id', nearby.map((l) => l.id))
    const locById = new Map(nearby.map((l) => [l.id, l]))
    for (const v of vids ?? []) {
      const loc = locById.get(v.location_id)
      if (!loc || !v.youtube_id) continue
      out.push({
        videoId: v.youtube_id, title: v.title ?? loc.name, thumbnail: v.thumbnail ?? '',
        channel: v.channel ?? '', lat: loc.lat, lng: loc.lng,
        distanceKm: Math.round(haversineKm(lat, lng, loc.lat, loc.lng) * 10) / 10,
        source: 'geotag', viewCount: 0, placeName: loc.name,
        placeNameSource: 'correction', duration: '', isShort: false,
        subscriberTier: null, subscriberCount: 0,
      })
    }
  }

  // 2) places (status=active)
  const { data: places } = await db
    .from('places')
    .select('name, video_url, latitude, longitude, category, status')
    .eq('status', 'active')
  for (const p of places ?? []) {
    if (p.latitude == null || p.longitude == null) continue
    const dist = haversineKm(lat, lng, p.latitude, p.longitude)
    if (dist > radius) continue
    const vid = extractYoutubeId(p.video_url ?? '')
    if (!vid) continue
    out.push({
      videoId: vid, title: p.name, thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
      channel: p.category ?? '', lat: p.latitude, lng: p.longitude,
      distanceKm: Math.round(dist * 10) / 10,
      source: 'geotag', viewCount: 0, placeName: p.name,
      placeNameSource: 'correction', duration: '', isShort: false,
      subscriberTier: null, subscriberCount: 0,
    })
  }
  return out
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim()
  const channelId = searchParams.get('channelId')?.trim() || undefined
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const radius = parseFloat(searchParams.get('radius') ?? '5')

  if ((!q && !channelId) || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'q (or channelId), lat, lng are required' }, { status: 400 })
  }

  // 검색 중심의 시/군/구 지역명 — "지역+키워드" 유튜브 검색과 비-geotag 위치 추출
  // 휴리스틱 양쪽에서 재사용. Kakao 호출(YT quota 무관)이므로 한 번만 계산.
  const regionName = await getRegionName(lat, lng)

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

  // Reuse cached search.list results for the same query/channel + ~1km area
  // (e.g. the user just changing the radius slider) instead of re-querying.
  const cacheKey = searchCacheKey(q, channelId, lat, lng)
  let unique = await getCachedSearchItems(cacheKey)

  if (!unique) {
    if (channelId) {
      // Filtered to one creator, not a keyword match — channel selection
      // replaces keyword search entirely. Deliberately no location param:
      // YouTube only returns geotagged videos when location/locationRadius
      // are set, which would wipe out channels that rarely geotag uploads.
      // Distance filtering against `radius` happens downstream instead,
      // same as the non-geotagged fallback path for keyword search.
      const channelItems = await ytSearch('', { channelId, order: 'date' })
      unique = dedupe(channelItems)
    } else {
      const category = classifyCategory(q!)
      const { enrichedQ, publishedAfter, order: catOrder } = buildCategoryParams(q!, category)

      const geoItems = await ytSearch(enrichedQ, {
        location: `${lat},${lng}`,
        locationRadius: `${radius}km`,
        publishedAfter,
      })
      unique = dedupe(geoItems)

      // 지역명 + 키워드 텍스트 검색 — geotag 없는 로컬 영상을 후보 풀에 포함.
      // location 파라미터를 빼야 비-geotag 영상도 반환됨(YouTube 동작). 항상 실행.
      if (regionName) {
        const regionItems = await ytSearch(`${regionName} ${q}`, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: 'relevance',
          publishedAfter,
        })
        unique = [...unique, ...dedupe(regionItems)]

        // 일반 키워드(food/cafe 등)는 콘텐츠 포맷 모디파이어를 붙인 보조 지역검색으로
        // 니치 로컬 영상 recall 보강 (예: "가평 맛집 먹방"). default 카테고리는 생략.
        const modifier = CATEGORY_MODIFIER[category]
        if (modifier) {
          const modItems = await ytSearch(`${regionName} ${q} ${modifier}`, {
            relevanceLanguage: 'ko',
            regionCode: 'KR',
            order: 'relevance',
            publishedAfter,
          })
          unique = [...unique, ...dedupe(modItems)]
        }
      }

      if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
        const broadItems = await ytSearch(enrichedQ, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: catOrder,
          publishedAfter,
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

  const results: VideoResult[] = []

  // Separate geo-tagged and non-geotagged for AI extraction limit
  const noGeo = details.filter((v) => !v.recordingDetails?.location?.latitude)

  await Promise.all([
    // Geo-tagged: fast path
    ...details
      .filter((v) => v.recordingDetails?.location?.latitude)
      .map(async (v) => {
        const correction = corrections.get(v.id)
        // 보정 위치가 없고 geotag가 순수 행정구역(시/군 중심점)이면 제외 — 정확한 위치 아님.
        if (!correction && isAdministrativeArea(v.recordingDetails?.locationDescription)) return
        const original = v.recordingDetails!.location!
        const pointLat = correction?.lat ?? original.latitude
        const pointLng = correction?.lng ?? original.longitude
        const dist = haversineKm(lat, lng, pointLat, pointLng)
        if (dist <= radius) {
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const explicitName = extractExplicitBusinessName(v.snippet.description ?? '')
          let placeName: string | undefined
          let placeNameSource: PlaceNameSource
          if (correction?.placeName) {
            placeName = correction.placeName
            placeNameSource = 'correction'
          } else if (explicitName) {
            placeName = explicitName
            placeNameSource = 'explicit_description'
          } else {
            const [address, titleMatch] = await Promise.all([
              correction?.address ? Promise.resolve(correction.address) : reverseGeocode(pointLat, pointLng),
              searchPlaceInfo(snippet.title, pointLat, pointLng),
            ])
            // Video title rarely contains the registered business name verbatim,
            // so fall back to searching by the address itself before giving up
            // and showing the bare address.
            const addressMatch = !titleMatch?.name && address
              ? await searchPlaceInfo(address, pointLat, pointLng)
              : null
            // Both title and address matching failed — check whether
            // viewers/the creator named the place in the comments before
            // giving up and showing only the bare address.
            const commentMatch = !titleMatch?.name && !addressMatch?.name
              ? await extractPlaceFromComments(v.id, snippet.channelId).then((candidate) =>
                  candidate ? searchPlaceInfo(candidate, pointLat, pointLng) : null
                )
              : null
            placeName = titleMatch?.name || addressMatch?.name || commentMatch?.name || address || undefined
            placeNameSource = titleMatch?.name
              ? 'title_match'
              : addressMatch?.name
                ? 'address_match'
                : commentMatch?.name
                  ? 'comment_match'
                  : 'address_fallback'
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
            subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
            subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
          })
        }
      }),

    // Non-geotagged: AI extraction (limit to first 40 to keep response time reasonable)
    ...noGeo.slice(0, 40).map(async (v) => {
      const correction = corrections.get(v.id)
      if (correction) {
        const dist = haversineKm(lat, lng, correction.lat, correction.lng)
        if (dist <= radius) {
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const explicitName = extractExplicitBusinessName(v.snippet.description ?? '')
          let placeName: string | undefined
          let placeNameSource: PlaceNameSource
          if (correction.placeName) {
            placeName = correction.placeName
            placeNameSource = 'correction'
          } else if (explicitName) {
            placeName = explicitName
            placeNameSource = 'explicit_description'
          } else {
            const titleMatch = await searchPlaceInfo(snippet.title, correction.lat, correction.lng)
            const addressMatch = !titleMatch?.name && correction.address
              ? await searchPlaceInfo(correction.address, correction.lat, correction.lng)
              : null
            const commentMatch = !titleMatch?.name && !addressMatch?.name
              ? await extractPlaceFromComments(v.id, snippet.channelId).then((candidate) =>
                  candidate ? searchPlaceInfo(candidate, correction.lat, correction.lng) : null
                )
              : null
            placeName = titleMatch?.name || addressMatch?.name || commentMatch?.name || correction.address || undefined
            placeNameSource = titleMatch?.name
              ? 'title_match'
              : addressMatch?.name
                ? 'address_match'
                : commentMatch?.name
                  ? 'comment_match'
                  : 'address_fallback'
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
              subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
              subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
            })
          }
        }
        return
      }

      // 지역 앵커 휴리스틱으로 좌표를 찾고, 반경 내면 결과로 추가. 성공 시 true.
      // requireCorroboration=true(AI 폴백)면 매칭 장소 행정구역이 영상 텍스트에
      // 언급될 때만 통과 — 해외 도시명 동명 오매칭 차단.
      const tryResolveAndPush = async (place: string, requireCorroboration: boolean): Promise<boolean> => {
        const geo2 = await geocodeKorean(place)
        if (!geo2) return false
        const dist = haversineKm(lat, lng, geo2.lat, geo2.lng)
        if (dist > radius) return false

        if (requireCorroboration) {
          const videoText = `${v.snippet.title} ${v.snippet.description ?? ''}`
          if (!addressCorroborated(geo2.address, videoText)) return false
        }

        const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
        const explicitName = extractExplicitBusinessName(v.snippet.description ?? '')
        let resolvedName: string
        let placeNameSource: PlaceNameSource
        if (explicitName) {
          resolvedName = explicitName
          placeNameSource = 'explicit_description'
        } else {
          const titleMatch = await searchPlaceInfo(snippet.title, geo2.lat, geo2.lng)
          const addressMatch = !titleMatch?.name
            ? await searchPlaceInfo(geo2.address, geo2.lat, geo2.lng)
            : null
          const commentMatch = !titleMatch?.name && !addressMatch?.name
            ? await extractPlaceFromComments(v.id, snippet.channelId).then((candidate) =>
                candidate ? searchPlaceInfo(candidate, geo2.lat, geo2.lng) : null
              )
            : null
          resolvedName = titleMatch?.name || addressMatch?.name || commentMatch?.name || geo2.address
          placeNameSource = titleMatch?.name
            ? 'title_match'
            : addressMatch?.name
              ? 'address_match'
              : commentMatch?.name
                ? 'comment_match'
                : 'address_fallback'
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
          subscriberTier: tierForSubscriberCount(subscriberCounts.get(v.snippet.channelId) ?? 0),
          subscriberCount: subscriberCounts.get(v.snippet.channelId) ?? 0,
        })
        return true
      }

      // ① 휴리스틱 우선 (지역 앵커 + 명시 업체명) — API 비용 없음
      const candidates = buildHeuristicPlaceQueries(v.snippet.title, v.snippet.description ?? '', regionName)
      let resolved = false
      for (const place of candidates) {
        if (await tryResolveAndPush(place, false)) { resolved = true; break }
      }
      // ② 휴리스틱 실패 시에만 AI 폴백 (videoId 캐시로 반복 호출 차단)
      // AI 결과는 지리 대조(requireCorroboration=true) 통과 시에만 채택.
      if (!resolved) {
        const aiQuery = await extractPlaceByAI(v.id, v.snippet.title, v.snippet.description ?? '')
        if (aiQuery) await tryResolveAndPush(aiQuery, true)
      }
    }),
  ])

  // Deduplicate results by videoId (race condition in parallel map), sort by viewCount desc
  const finalSeen = new Set<string>()
  const deduped = results.filter((r) => {
    if (finalSeen.has(r.videoId)) return false
    finalSeen.add(r.videoId)
    return true
  })
  const [blocked, myHidden] = await Promise.all([getBlockedVideoIds(), getMyHiddenVideoIds()])
  const filtered = deduped.filter((r) => !blocked.has(r.videoId) && !myHidden.has(r.videoId))
  filtered.sort((a, b) => b.viewCount - a.viewCount)

  // 등록 장소(관리자/파트너)는 큐레이션된 데이터이므로 상단에 배치.
  // YouTube 결과와 videoId 중복 시 등록본 우선.
  const registered = await getRegisteredResults(lat, lng, radius)
  const regSeen = new Set(registered.map((r) => r.videoId))
  const finalResults = [...registered, ...filtered.filter((r) => !regSeen.has(r.videoId))]

  return NextResponse.json({ results: finalResults })
}
