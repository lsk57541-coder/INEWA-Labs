import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { haversineKm } from '@/lib/haversine'
import { geocodeKorean, reverseGeocode, searchPlaceInfo } from '@/lib/geocode'
import { extractLocations } from '@/lib/extractLocation'

const REPORT_THRESHOLD = 3

async function getBlockedVideoIds(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return new Set()

  const supabase = createClient(url, key)
  const { data } = await supabase.from('location_reports').select('video_id')
  if (!data) return new Set()

  const counts = new Map<string, number>()
  for (const row of data) {
    counts.set(row.video_id, (counts.get(row.video_id) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count >= REPORT_THRESHOLD).map(([id]) => id))
}

interface LocationCorrection {
  lat: number
  lng: number
  address: string
}

// User-confirmed corrections (from "주소가 정확하지 않아요" reports that were
// successfully verified against Kakao) override the geotag/AI-derived location.
async function getLocationCorrections(): Promise<Map<string, LocationCorrection>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return new Map()

  const supabase = createClient(url, key)
  const { data } = await supabase.from('location_corrections').select('video_id, lat, lng, address')
  if (!data) return new Map()

  return new Map(data.map((row) => [row.video_id, { lat: row.lat, lng: row.lng, address: row.address }]))
}

export type SubscriberTier = 'bronze' | 'silver' | 'gold'

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
  duration: string
  isShort: boolean
  subscriberTier: SubscriberTier
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

// Subscriber-count tiers used to surface well-known creators vs. small channels.
const TIER_THRESHOLDS: { min: number; tier: SubscriberTier }[] = [
  { min: 100_000, tier: 'gold' },
  { min: 10_000, tier: 'silver' },
  { min: 0, tier: 'bronze' },
]

function tierForSubscriberCount(count: number): SubscriberTier {
  return TIER_THRESHOLDS.find((t) => count >= t.min)?.tier ?? 'bronze'
}

async function getChannelTiers(channelIds: string[]): Promise<Map<string, SubscriberTier>> {
  const key = process.env.YOUTUBE_API_KEY
  const uniqueIds = [...new Set(channelIds)]
  if (!key || uniqueIds.length === 0) return new Map()

  const chunks: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += 50) chunks.push(uniqueIds.slice(i, i + 50))

  const tiers = new Map<string, SubscriberTier>()
  await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({ part: 'statistics', id: chunk.join(','), key })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
      if (!res.ok) return
      const json = await res.json() as { items?: { id: string; statistics?: { subscriberCount?: string } }[] }
      for (const item of json.items ?? []) {
        tiers.set(item.id, tierForSubscriberCount(parseInt(item.statistics?.subscriberCount ?? '0', 10)))
      }
    })
  )
  return tiers
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
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
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
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
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

  // 2 parallel searches: geo-based + broad KR. "여행" variant is only
  // fetched as a fallback when these two don't return enough candidates,
  // to keep quota usage down without hurting coverage for popular keywords.
  const MIN_CANDIDATES_BEFORE_FALLBACK = 15

  const seen = new Set<string>()
  const dedupe = (items: YTSearchItem[]) =>
    items.filter((item) => {
      if (seen.has(item.id.videoId)) return false
      seen.add(item.id.videoId)
      return true
    })

  let unique: YTSearchItem[]

  if (channelId) {
    // Filtered to one creator: a single near-me search restricted to their channel is enough.
    const channelItems = await ytSearch(q ?? '', {
      channelId,
      location: `${lat},${lng}`,
      locationRadius: `${radius}km`,
      order: 'date',
    })
    unique = dedupe(channelItems)
  } else {
    const [geoItems, broadItems] = await Promise.all([
      ytSearch(q!, {
        location: `${lat},${lng}`,
        locationRadius: `${radius}km`,
      }),
      ytSearch(q!, {
        relevanceLanguage: 'ko',
        regionCode: 'KR',
        order: 'viewCount',
      }),
    ])

    unique = dedupe([...geoItems, ...broadItems])

    if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
      const travelItems = await ytSearch(`${q} 여행`, {
        relevanceLanguage: 'ko',
        regionCode: 'KR',
        order: 'viewCount',
      }, 30)
      unique = [...unique, ...dedupe(travelItems)]
    }
  }

  const [details, corrections, channelTiers] = await Promise.all([
    fetchVideoDetails(unique.map((i) => i.id.videoId)),
    getLocationCorrections(),
    getChannelTiers(unique.map((i) => i.snippet.channelId)),
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
          let placeName: string | undefined
          if (correction) {
            placeName = correction.address
          } else {
            const [address, place] = await Promise.all([
              reverseGeocode(pointLat, pointLng),
              searchPlaceInfo(snippet.title, pointLat, pointLng),
            ])
            placeName = place?.name || address || undefined
          }
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
            duration: formatDuration(durationSec),
            isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
            subscriberTier: channelTiers.get(v.snippet.channelId) ?? 'bronze',
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
            placeName: correction.address,
            duration: formatDuration(durationSec),
            isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
            subscriberTier: channelTiers.get(v.snippet.channelId) ?? 'bronze',
          })
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
          const placeInfo = await searchPlaceInfo(snippet.title, geo2.lat, geo2.lng)
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
            placeName: placeInfo?.name || geo2.address,
            duration: formatDuration(durationSec),
            isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
            subscriberTier: channelTiers.get(v.snippet.channelId) ?? 'bronze',
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
  const blocked = await getBlockedVideoIds()
  const filtered = deduped.filter((r) => !blocked.has(r.videoId))
  filtered.sort((a, b) => b.viewCount - a.viewCount)

  return NextResponse.json({ results: filtered })
}
