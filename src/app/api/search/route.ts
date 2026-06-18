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
}

interface YTSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    thumbnails: { medium: { url: string } }
  }
}

interface YTVideoItem {
  id: string
  snippet: {
    description: string
    title: string
    channelTitle: string
    thumbnails: { medium: { url: string } }
  }
  recordingDetails?: { location?: { latitude: number; longitude: number } }
  statistics?: { viewCount?: string }
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
    q,
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
        part: 'snippet,recordingDetails,statistics',
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
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const radius = parseFloat(searchParams.get('radius') ?? '5')

  if (!q || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'q, lat, lng are required' }, { status: 400 })
  }

  // 2 parallel searches: geo-based + broad KR. "여행" variant is only
  // fetched as a fallback when these two don't return enough candidates,
  // to keep quota usage down without hurting coverage for popular keywords.
  const MIN_CANDIDATES_BEFORE_FALLBACK = 15

  const [geoItems, broadItems] = await Promise.all([
    ytSearch(q, {
      location: `${lat},${lng}`,
      locationRadius: `${radius}km`,
    }),
    ytSearch(q, {
      relevanceLanguage: 'ko',
      regionCode: 'KR',
      order: 'viewCount',
    }),
  ])

  const seen = new Set<string>()
  const dedupe = (items: YTSearchItem[]) =>
    items.filter((item) => {
      if (seen.has(item.id.videoId)) return false
      seen.add(item.id.videoId)
      return true
    })

  let unique = dedupe([...geoItems, ...broadItems])

  if (unique.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
    const travelItems = await ytSearch(`${q} 여행`, {
      relevanceLanguage: 'ko',
      regionCode: 'KR',
      order: 'viewCount',
    }, 30)
    unique = [...unique, ...dedupe(travelItems)]
  }

  const details = await fetchVideoDetails(unique.map((i) => i.id.videoId))

  const results: VideoResult[] = []

  // Separate geo-tagged and non-geotagged for AI extraction limit
  const noGeo = details.filter((v) => !v.recordingDetails?.location?.latitude)

  await Promise.all([
    // Geo-tagged: fast path
    ...details
      .filter((v) => v.recordingDetails?.location?.latitude)
      .map(async (v) => {
        const geo = v.recordingDetails!.location!
        const dist = haversineKm(lat, lng, geo.latitude, geo.longitude)
        if (dist <= radius) {
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const [address, place] = await Promise.all([
            reverseGeocode(geo.latitude, geo.longitude),
            searchPlaceInfo(snippet.title, geo.latitude, geo.longitude),
          ])
          const placeName = place?.name || address || undefined
          results.push({
            videoId: v.id,
            title: snippet.title,
            thumbnail: snippet.thumbnails.medium.url,
            channel: snippet.channelTitle,
            lat: geo.latitude,
            lng: geo.longitude,
            distanceKm: Math.round(dist * 10) / 10,
            source: 'geotag',
            viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
            placeName,
          })
        }
      }),

    // Non-geotagged: AI extraction (limit to first 40 to keep response time reasonable)
    ...noGeo.slice(0, 40).map(async (v) => {
      const places = await extractLocations(v.snippet.title, v.snippet.description ?? '')
      for (const place of places) {
        const geo2 = await geocodeKorean(place)
        if (!geo2) continue
        const dist = haversineKm(lat, lng, geo2.lat, geo2.lng)
        if (dist <= radius) {
          const snippet = unique.find((i) => i.id.videoId === v.id)?.snippet ?? v.snippet
          const placeInfo = await searchPlaceInfo(snippet.title, geo2.lat, geo2.lng)
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
