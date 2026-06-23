import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { haversineKm } from '@/lib/haversine'
import { geocodeKorean, reverseGeocode, searchPlaceInfo } from '@/lib/geocode'
import { extractLocations, extractExplicitBusinessName } from '@/lib/extractLocation'
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
  recordingDetails?: { location?: { latitude: number; longitude: number } }
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
      const geoItems = await ytSearch(q!, {
        location: `${lat},${lng}`,
        locationRadius: `${radius}km`,
      })
      unique = dedupe(geoItems)

      if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
        const broadItems = await ytSearch(q!, {
          relevanceLanguage: 'ko',
          regionCode: 'KR',
          order: 'viewCount',
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
            results.push({
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

      const places = await extractLocations(v.snippet.title, v.snippet.description ?? '')
      for (const place of places) {
        const geo2 = await geocodeKorean(place)
        if (!geo2) continue
        const dist = haversineKm(lat, lng, geo2.lat, geo2.lng)
        if (dist <= radius) {
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
          if (!meetsConfidence(placeNameSource, minConfidence)) break
          const durationSec = parseDurationSec(v.contentDetails?.duration ?? '')
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
          break
        }
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

  return NextResponse.json({ results: filtered })
}
