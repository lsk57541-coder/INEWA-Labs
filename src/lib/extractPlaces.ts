import Anthropic from '@anthropic-ai/sdk'
import { geocodeKorean } from '@/lib/geocode'
import { haversineKm } from '@/lib/haversine'

export interface ExtractedPlace {
  name: string
  timestamp_seconds: number | null
  lat?: number // 좌표 내장 라인(0순위)일 때만
  lng?: number
  source?: 'coords' | 'timestamp' | 'ai'
}

export interface YouTubeSnippet {
  title: string
  description: string
  channelId: string
}

export function mmssToSeconds(mmss: string): number | null {
  // MM:SS 또는 HH:MM:SS 모두 인식.
  const m = mmss.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = m[1] ? parseInt(m[1], 10) : 0
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

// 텍스트 정규화 — 공백·특수문자·이모지 제거 후 소문자. name-in-text 대조용.
function normalizeForMatch(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

// (d) 가드레일: 추출한 상호명이 영상 텍스트(제목+설명+해시태그)에 실제로
// 존재하는지 — AI 복수추출의 환각(영상에 없는 유명 가게 나열)을 차단.
export function nameInText(name: string, text: string): boolean {
  const n = normalizeForMatch(name)
  if (n.length < 2) return false
  return normalizeForMatch(text).includes(n)
}

function cleanName(raw: string): string {
  return raw.replace(/\s*[\(\（].*?[\)\）]$/, '').replace(/\s+/g, ' ').trim()
}

const SKIP_KEYWORDS = ['인트로', '아침', '점심', '저녁', '출발', '이동', '도착', '일기', 'outro', 'intro', 'ending']

export function extractFromTimestamps(description: string): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  const lines = description.split('\n')

  for (const line of lines) {
    const match = line.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/)
    if (!match) continue

    const [, ts, rawName] = match
    const name = cleanName(rawName)
    if (!name || name.length < 2) continue

    const lower = name.toLowerCase()
    if (SKIP_KEYWORDS.some(kw => lower.includes(kw))) continue
    if (/^[가-힣]{2,4}(시|군|구|동|읍|면)$/.test(name)) continue

    results.push({ name, timestamp_seconds: mmssToSeconds(ts), source: 'timestamp' })
  }

  return results.slice(0, 15)
}

// 0순위: 좌표 내장 라인 파싱 (일부 모음영상은 "(lat, lng) // 상호명" 형태로
// 정확한 좌표를 설명란에 박아둠 — 예: "00:00:03 (35.20, 126.87) // 25시참숯구이").
// 좌표가 창작자 제공이라 geocode·지역/카테고리 가드레일 불필요(반경만 검사).
export function extractEmbeddedCoords(description: string): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  for (const line of description.split('\n')) {
    const m = line.match(
      /(?:(\d{1,2}:\d{2}(?::\d{2})?)\s+)?\(\s*(\d{2,3}\.\d{3,}),\s*(\d{2,3}\.\d{3,})\s*\)\s*(?:\/\/|｜|\|)?\s*(.*)$/
    )
    if (!m) continue
    const [, ts, latS, lngS, rawName] = m
    const name = cleanName(rawName || '')
    if (!name || name.length < 2) continue
    if (SKIP_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) continue
    results.push({
      name,
      timestamp_seconds: ts ? mmssToSeconds(ts) : null,
      lat: parseFloat(latS),
      lng: parseFloat(lngS),
      source: 'coords',
    })
  }
  return results.slice(0, 15)
}

// 복수 장소 추출 오케스트레이터 (검색 라우트용). 우선순위:
//   ① 좌표내장 → ② 타임스탬프 챕터 → ③ AI 복수추출 (앞이 비면 다음으로).
// videoId 메모리 캐시로 같은 검색 반복(반경 변경 등) 시 AI 재호출 차단.
// ※ Supabase 영속 캐시는 다음 작업으로 분리(이번 스코프 밖) — 콜드스타트마다 캐시 소실.
const multiCache = new Map<string, ExtractedPlace[]>()

export async function extractMultiPlaces(
  videoId: string,
  title: string,
  description: string
): Promise<ExtractedPlace[]> {
  if (multiCache.has(videoId)) return multiCache.get(videoId)!

  const coords = extractEmbeddedCoords(description)
  if (coords.length > 0) { multiCache.set(videoId, coords.slice(0, 10)); return coords.slice(0, 10) }

  const chapters = extractFromTimestamps(description)
  if (chapters.length > 0) { multiCache.set(videoId, chapters.slice(0, 10)); return chapters.slice(0, 10) }

  const aiPlaces = (await extractWithClaude(title, description)).map((p) => ({ ...p, source: 'ai' as const }))
  multiCache.set(videoId, aiPlaces.slice(0, 10))
  return aiPlaces.slice(0, 10)
}

// 모음/랭킹 영상 감지 — 제목 신호 또는 설명란 타임스탬프 라인 다수.
export function isCompilationVideo(title: string, description: string): boolean {
  if (/BEST|TOP|모음|순위|총정리|리스트|랭킹|\d+\s*(곳|선|위|군데)|맛집\s*\d/i.test(title)) return true
  const tsLines = (description.match(/^\s*\d{1,2}:\d{2}/gm) || []).length
  return tsLines >= 3
}

export async function extractWithClaude(title: string, description: string): Promise<ExtractedPlace[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const text = `제목: ${title}\n\n설명:\n${description}`.slice(0, 4000)

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `다음 유튜브 영상 제목과 설명에서 방문한 식당, 카페, 숙소 등의 상호명(가게 이름)만 추출해줘.
타임스탬프(00:00 형식)가 있으면 함께 추출해줘.
JSON 배열로만 반환해. 다른 텍스트 없이 JSON만:
[{"name": "상호명", "timestamp": "mm:ss 또는 null"}]

없으면 빈 배열 [] 반환.

영상 정보:
${text}`,
        },
      ],
    })

    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = answer.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as { name: string; timestamp: string | null }[]
    return parsed
      .filter(p => p.name && typeof p.name === 'string')
      .map(p => ({
        name: cleanName(p.name),
        timestamp_seconds: p.timestamp ? mmssToSeconds(p.timestamp) : null,
      }))
      .filter(p => p.name.length >= 2)
      .slice(0, 15)
  } catch {
    return []
  }
}

export async function getVideoSnippet(videoId: string): Promise<YouTubeSnippet | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = await res.json() as { items?: { snippet: { title: string; description: string; channelId: string } }[] }
  const item = json.items?.[0]
  if (!item) return null
  return {
    title: item.snippet.title,
    description: item.snippet.description,
    channelId: item.snippet.channelId,
  }
}

export interface ResolvedPlace { name: string; lat: number; lng: number; distanceKm: number; startSec?: number }

export async function resolveCompilationPlaces(opts: {
  videoId: string; title: string; description: string
  regionName: string | null; lat: number; lng: number; radius: number
  adminDesc: string | null; allowedGroups: string[]
  withinAdminArea: (desc: string, address: string) => boolean
  addressCorroborated: (address: string, text: string) => boolean
}): Promise<ResolvedPlace[]> {
  const { videoId, title, description, regionName, lat, lng, radius, adminDesc, allowedGroups } = opts
  const videoText = `${title} ${description}`
  const out: ResolvedPlace[] = []
  for (const place of await extractMultiPlaces(videoId, title, description)) {
    let pLat: number, pLng: number
    if (place.lat != null && place.lng != null) {
      pLat = place.lat; pLng = place.lng        // 0순위 좌표내장 → (a)반경만. TODO: (c)카테고리 미적용(0.4%)
    } else {
      if (place.source === 'ai' && !nameInText(place.name, videoText)) continue   // (d) geocode 전 환각 차단
      const geo2 = await geocodeKorean(`${regionName ?? ''} ${place.name}`.trim())
      if (!geo2) continue
      pLat = geo2.lat; pLng = geo2.lng
      if (adminDesc) { if (!opts.withinAdminArea(adminDesc, geo2.address)) continue }   // (b)
      else if (!opts.addressCorroborated(geo2.address, videoText)) continue            // (b)
      if (!allowedGroups.includes(geo2.categoryGroup)) continue                        // (c)
    }
    const dist = haversineKm(lat, lng, pLat, pLng)
    if (dist > radius) continue                                                        // (a)
    out.push({ name: place.name, lat: pLat, lng: pLng, distanceKm: Math.round(dist * 10) / 10, startSec: place.timestamp_seconds ?? undefined })
  }
  return out
}
