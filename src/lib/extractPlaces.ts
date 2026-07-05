import Anthropic from '@anthropic-ai/sdk'
import { geocodeKorean } from '@/lib/geocode'
import { haversineKm } from '@/lib/haversine'

export interface ExtractedPlace {
  name: string
  timestamp_seconds: number | null
  lat?: number // 좌표 내장 라인(0순위)일 때만
  lng?: number
  address?: string // "가게명 + 📍주소" 페어 형식에서 추출된 명시 주소(좌표를 이 주소로 geocode)
  source?: 'coords' | 'timestamp' | 'ai' | 'list'
}

export interface YouTubeSnippet {
  title: string
  description: string
  channelId: string
  publishedAt?: string
  viewCount?: number
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

// 모음영상 설명란의 비-장소 보일러플레이트(구독 유도/문의/광고/타임스탬프 안내 등) 차단.
const NON_PLACE_RE = /(구독|좋아요|알림|문의|협찬|광고|제휴|비즈니스|인스타|채널|구독자|쿠폰|할인|예약|이벤트|댓글|목차|타임스탬프|챕터|편집|렌트카|파트너스|수수료|가입|bgm|sns|youtu)/i
// 영상 제목성 헤더("베스트 20", "맛집 TOP10" 등) 차단.
const HEADER_RE = /(베스트|best|top|순위|모음|총정리|리스트|랭킹)\s*\d*/i

// 추출된 한 줄이 "실제 가게명"으로 보이는지 — false positive(구독유도·문의·헤더·문장형·주소명·이메일) 차단.
function isLikelyPlaceName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 25) return false
  if (name.includes('@')) return false                          // 이메일 줄
  if (/[?？]$/.test(name)) return false                          // 질문형("그녀들의 1픽은?")
  if (SKIP_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) return false
  if (NON_PLACE_RE.test(name)) return false                     // 비-장소 보일러플레이트
  if (HEADER_RE.test(name)) return false                        // 제목성 헤더
  if (/^[가-힣]{2,4}(시|군|구|동|읍|면)$/.test(name)) return false  // 순수 행정구역명
  if (/(요|니다|세요|해요|부탁|드립니다|습니다)$/.test(name)) return false  // 문장형
  return true
}

export function extractFromTimestamps(description: string, limit = 15): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  const lines = description.split('\n')

  for (const line of lines) {
    const match = line.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/)
    if (!match) continue

    const [, ts, rawName] = match
    const name = cleanName(rawName)
    if (!isLikelyPlaceName(name)) continue

    results.push({ name, timestamp_seconds: mmssToSeconds(ts), source: 'timestamp' })
  }

  return results.slice(0, limit)
}

// 가게명 나열 리스트 파서 — "📍/●/•/▶/①~⑳/1./1)/1위/- 가게명" 등 마커 + 가게명.
// extractFromTimestamps(타임스탬프 줄)와 상보적. 타 영상 링크/이메일 줄은 선제 제외하고,
// isLikelyPlaceName으로 비-장소(구독/문의/헤더/문장형)를 거른다. 정밀도 우선(가짜 핀 0 목표).
const MARKER_RE = /^(?:📍|▶️?|●|○|◦|•|·|‣|–|\*|\+|[①-⑳]|\d{1,2}\s*[.)위])\s*(.+)$/u
export function extractFromMarkerList(description: string): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  for (const raw of description.split('\n')) {
    const line = raw.trim()
    if (/youtu\.?be|youtube\.com|@/i.test(line)) continue   // 타 영상 링크/이메일 줄 제외
    const m = line.match(MARKER_RE)
    if (!m) continue
    const name = cleanName(m[1])
    if (!isLikelyPlaceName(name)) continue
    if (results.some(r => normalizeForMatch(r.name) === normalizeForMatch(name))) continue // 중복
    results.push({ name, timestamp_seconds: null, source: 'list' })
  }
  return results.slice(0, 40)
}

// 한국 주소 신호(강한 것만) — 마커 내용이 "가게명"인지 "주소"인지 판별. 약한 동/리 규칙은
// "야키토리"(…리)류를 주소로 오판하므로 제외. 애매하면 false(=이름) 쪽으로.
const ADDRESS_RE = /(특별자치도|특별자치시|특별시|광역시)|[가-힣]{2,}(시|군|구)\s+\S|[가-힣]+(로|길)\s*\d/
function looksLikeAddress(s: string): boolean {
  return ADDRESS_RE.test(s)
}

// 가게명 정리 — ★cleanName(괄호·URL 제거) 먼저, 그 다음 설명 구분자 분리.
// 순서 중요: "왕고모네국수 ( https://naver.me/.. )"의 URL 안 ':'에서 잘리는 걸 방지.
// "봉성식당 : 고사리 삼겹살 맛집" → "봉성식당".
const NAME_SPLIT_RE = /\s*[:|｜ㅣ]\s*|\s+[-–]\s+/
function cleanPlaceName(s: string): string {
  return cleanName(cleanName(s).split(NAME_SPLIT_RE)[0])
}

// 동기 통합 추출(AI 없음) — admin 추출 라우트 전용. 두 형식 모두 처리:
//  ① "가게명 나열"(📍/번호 + 가게명) ② "가게명 줄(타임스탬프 + 가게명 : 설명) + 📍주소 줄" 페어.
// 줄 순서대로 1패스: 챕터/이름 마커 → place(이름), 주소형 📍마커 → 직전 "주소 없는 place"에 주소 부착.
// (📍 마커가 영상마다 가게명/주소로 의미가 달라 looksLikeAddress로 분기.) 이름 dedup.
export function extractPlaceList(_title: string, description: string): ExtractedPlace[] {
  const places: ExtractedPlace[] = []
  const byName = new Map<string, ExtractedPlace>()
  const pushName = (name: string): ExtractedPlace => {
    const k = normalizeForMatch(name)
    const existing = byName.get(k)
    if (existing) return existing
    const p: ExtractedPlace = { name, timestamp_seconds: null, source: 'list' }
    places.push(p)
    byName.set(k, p)
    return p
  }
  let pending: ExtractedPlace | null = null

  for (const raw of description.split('\n')) {
    const line = raw.trim()
    const cm = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/)
    if (cm) {
      const name = cleanPlaceName(cm[2])
      if (isLikelyPlaceName(name)) {
        const p = pushName(name)
        if (p.timestamp_seconds == null) p.timestamp_seconds = mmssToSeconds(cm[1])
        pending = p
      }
      continue
    }
    if (/youtu\.?be|youtube\.com|@/i.test(line)) continue
    const mm = line.match(MARKER_RE)
    if (!mm) continue
    const cleaned = cleanName(mm[1])
    if (looksLikeAddress(cleaned)) {
      // 주소 → 직전 "주소 없는 place"에 부착(없으면 스킵 = 괄호 곁다리 주소 자동 제외).
      const target = (pending && !pending.address) ? pending : places.find((p) => !p.address)
      if (target) target.address = cleaned
    } else {
      const name = cleanPlaceName(mm[1])
      if (isLikelyPlaceName(name)) pending = pushName(name)
    }
  }
  return places.slice(0, 40)
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
      .slice(0, 40)
  } catch {
    return []
  }
}

export async function getVideoSnippet(videoId: string): Promise<YouTubeSnippet | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  // snippet,statistics는 동일 호출(1유닛)이라 조회수는 추가 quota 0.
  const params = new URLSearchParams({ part: 'snippet,statistics', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = await res.json() as {
    items?: {
      snippet: { title: string; description: string; channelId: string; publishedAt?: string }
      statistics?: { viewCount?: string }
    }[]
  }
  const item = json.items?.[0]
  if (!item) return null
  return {
    title: item.snippet.title,
    description: item.snippet.description,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    viewCount: parseInt(item.statistics?.viewCount ?? '0', 10),
  }
}

export interface ResolvedPlace { name: string; lat: number; lng: number; distanceKm: number; startSec?: number; phone?: string; kakaoPlaceId?: string }

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
    // 순수검색 원스톱: geocode 경로면 geo2의 phone/kakaoPlaceId를 실어 카드까지(미저장). 좌표내장은 원천 없음 → undefined.
    let pPhone: string | undefined
    let pKakaoId: string | undefined
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
      pPhone = geo2.phone; pKakaoId = geo2.kakaoPlaceId
    }
    const dist = haversineKm(lat, lng, pLat, pLng)
    if (dist > radius) continue                                                        // (a)
    out.push({ name: place.name, lat: pLat, lng: pLng, distanceKm: Math.round(dist * 10) / 10, startSec: place.timestamp_seconds ?? undefined, phone: pPhone, kakaoPlaceId: pKakaoId })
  }
  return out
}
