export interface GeoResult {
  lat: number
  lng: number
  address: string
  name: string
  categoryGroup: string
  phone?: string        // 카카오 전화(순수 검색 카드 '전화하기'용). 저장 안 함 — 런타임 표시 전용.
  kakaoPlaceId?: string // 카카오 place id(카드 상세 딥링크용). 응답에 이미 옴 → 파싱만 추가(호출 0).
}

// Kakao Local REST 공통 fetch — 4초 타임아웃(AbortController). 초과/네트워크 실패 시 null 반환
// → 각 호출부의 기존 null 폴백 경로로 흐른다(Kakao 무응답 시 무한 pending 방지).
//
// ★ 이 파일의 카카오 호출은 전부 이 래퍼를 거쳐야 한다. 맨 fetch를 쓰면 연결 타임아웃 시
// undici가 던지는 예외(UND_ERR_CONNECT_TIMEOUT, 기본 10초)가 그대로 호출부 밖으로 전파돼
// 검색 요청 전체가 500으로 죽는다(실제 장애: dapi.kakao.com ConnectTimeout → /api/search 500).
// 정상 응답은 실측 13~19ms(최대 147ms)라 4초는 충분히 넉넉하다 — 값을 더 올리면 카카오가
// 멎었을 때 붙잡히는 시간만 길어져 서버리스 함수 전체 타임아웃 위험이 커진다.
// ── 카카오 발사 동시성 상한 + rate-limit 백오프 ──────────────────────────────
// 무제한 병렬(Promise.all)이 카카오 rate limit을 유발한다: 한 검색이 ~900콜을 거의 동시에 쏘면
// 카카오가 그 절반 이상을 거부한다 — 대부분 HTTP 400 + {code:-10 "API limit has been exceeded"},
// 최고 부하에선 429도. 어느 콜이 통과하는지가 비결정이라 결과수가 회차마다 40%씩 요동쳤다.
// 계단 실측(2026-07-22): 동시성 8에서 거부율이 0%로 수렴(N=10=13.8%, N=20/50은 무제한과 동일한
// 50%+), 카카오 유효 동시 천장 ≈ 8~9. recall 173→331 회복(+1.3초). 이 상한은 kakaoFetch를 지나는
// 모든 카카오 호출에 전역 적용된다(검색 경로 5함수 전부 이 관문 경유).
const KAKAO_CONCURRENCY = 8
let kakaoActive = 0
const kakaoWaiters: (() => void)[] = []
function acquireKakaoSlot(): Promise<void> {
  if (kakaoActive < KAKAO_CONCURRENCY) { kakaoActive++; return Promise.resolve() }
  return new Promise<void>((resolve) => kakaoWaiters.push(resolve)) // 슬롯은 release에서 승계(active 유지)
}
function releaseKakaoSlot(): void {
  const next = kakaoWaiters.shift()
  if (next) next(); else kakaoActive--
}

const kakaoSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const KAKAO_RETRY_BACKOFF_MS = [300, 900] // rate-limit 시 지수 백오프, 최대 2회 재시도

// rate-limit 신호에만 재시도한다: 429, 또는 400 + code:-10(카카오는 할당량 초과를 400으로도 표현).
// 타 4xx/5xx는 재시도하지 않는다 — 진짜 오류를 반복 호출로 가리면 안 되므로.
async function kakaoRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true
  if (res.status !== 400) return false
  try {
    const body = await res.clone().json() as { code?: number } // clone: 원본 res는 호출부가 그대로 소비
    return body?.code === -10
  } catch {
    return false
  }
}

async function kakaoFetch(url: string, key: string): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    await acquireKakaoSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    let res: Response | null = null
    try {
      res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: controller.signal })
    } catch (e) {
      // 조용히 삼키면 "결과가 왜 비었는지" 추적이 불가능해진다 — 경로만 남긴다(키는 헤더라 URL에 없음).
      console.error('[kakao] fetch failed', new URL(url).pathname, (e as { cause?: { code?: string } })?.cause?.code ?? e)
      return null
    } finally {
      // 슬롯은 fetch 완료 즉시 반납 — 백오프 대기 중 슬롯을 쥐면 전체 파이프라인이 직렬화된다.
      clearTimeout(timer)
      releaseKakaoSlot()
    }
    if (!res) return null // 도달 불가(위 catch가 실패 시 return) — TS 방어
    // rate-limit이면 슬롯 없는 상태로 백오프 후 재시도. 재시도 소진 시 그대로 반환(호출부가 !res.ok로 폴백).
    if (attempt < KAKAO_RETRY_BACKOFF_MS.length && await kakaoRateLimited(res)) {
      await kakaoSleep(KAKAO_RETRY_BACKOFF_MS[attempt])
      continue
    }
    return res
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return null

  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`
  const res = await kakaoFetch(url, key)
  if (!res || !res.ok) return null

  const json = await res.json() as {
    documents: {
      road_address: { address_name: string } | null
      address: { address_name: string } | null
    }[]
  }
  const doc = json.documents?.[0]
  if (!doc) return null
  return doc.road_address?.address_name ?? doc.address?.address_name ?? null
}

// 좌표 → 시/군/구 지역명 (접미사 제거). "지역명 + 키워드" 유튜브 검색용.
// reverseGeocode는 전체 주소를 주지만, 이건 coord2regioncode로 깔끔한 행정구역명만 추출.
export async function getRegionName(lat: number, lng: number): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return null

  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`
  const res = await kakaoFetch(url, key)
  if (!res || !res.ok) return null

  const json = await res.json() as {
    documents: { region_1depth_name: string; region_2depth_name: string }[]
  }
  const doc = json.documents?.[0]
  if (!doc) return null

  const raw = doc.region_2depth_name || doc.region_1depth_name
  if (!raw) return null
  // "가평군"→"가평", "강남구"→"강남", "안산시 단원구"→"안산". 유튜버가 제목에 쓰는 형태.
  // 단 "서구"/"동구"처럼 접미사 제거 시 1글자만 남으면(서/동/남/북/중) 도시명이 빠져
  // 무의미 → 풀네임("서구") 유지 (대도시 구 recall 깨짐 방지). 도시 모호성은 getCityName prefix로 별도 해소.
  const first = raw.split(' ')[0]
  const stripped = first.replace(/(시|군|구)$/, '')
  return stripped.length >= 2 ? stripped : first
}

// 검색 중심의 시/도명(region_1depth) → 대도시(광역시/특별시)일 때만 "광주"/"서울" 형태로 반환.
// geocode 쿼리에서 대도시 동명 구(서구/동구/광산구…) 모호성 해소 prefix용. 도 단위(가평/강남 등은
// region_2depth가 이미 고유)에선 '' 반환 → prefix 불필요.
export async function getCityName(lat: number, lng: number): Promise<string> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return ''
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`
  const res = await kakaoFetch(url, key)
  if (!res || !res.ok) return ''
  const json = await res.json() as { documents: { region_1depth_name: string }[] }
  const r1 = json.documents?.[0]?.region_1depth_name ?? ''
  if (!/(특별시|광역시|특별자치시)$/.test(r1)) return ''
  return r1.replace(/(특별시|광역시|특별자치시)$/, '')
}

export interface PlaceDetails {
  name: string
  category: string
  address: string
  phone?: string
  kakaoPlaceId?: string // 카카오 place id(카드 상세 딥링크용). 응답에 이미 옴 → 파싱만 추가(호출 0).
}

// Strips hashtags/emoji/punctuation from a video title so it works as Kakao
// keyword-search query text — keeping words like "청국장" lets Kakao match
// against the place's actual name/category instead of just its address.
function cleanQuery(text: string): string {
  return text
    .replace(/#\S+/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

// queryText should be the video title (not just an address) — title words like
// "청국장" help Kakao match the actual business by name/category instead of
// returning an unrelated business that merely shares the same building address.
// Distance to the exact filmed coordinate is still required as a final sanity
// check; callers should treat null as "no reliable info available". The
// matched place's own `place_name` from Kakao is the real business name —
// free, since it comes from the Kakao Local API we already use.
export async function searchPlaceInfo(queryText: string, lat: number, lng: number): Promise<PlaceDetails | null> {
  const key = process.env.KAKAO_REST_API_KEY
  const query = cleanQuery(queryText)
  if (!key || !query) return null

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=300&sort=distance&size=1`
  const res = await kakaoFetch(url, key)
  if (!res || !res.ok) return null

  const json = await res.json() as {
    documents: {
      id: string
      place_name: string
      category_name: string
      road_address_name: string
      address_name: string
      phone: string
      distance: string
    }[]
  }
  const doc = json.documents?.[0]
  if (!doc) return null

  const distance = Number(doc.distance)
  if (Number.isFinite(distance) && distance > 50) return null

  return {
    name: doc.place_name,
    category: doc.category_name,
    address: doc.road_address_name || doc.address_name,
    phone: doc.phone || undefined,
    kakaoPlaceId: doc.id || undefined,
  }
}

export async function geocodeKorean(place: string): Promise<GeoResult | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return null

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(place)}&size=1`
  const res = await kakaoFetch(url, key)
  if (!res || !res.ok) return null

  const json = await res.json() as { documents: { id: string; y: string; x: string; address_name: string; place_name: string; category_group_code: string; phone: string }[] }
  const doc = json.documents?.[0]
  if (!doc) return null

  return {
    lat: parseFloat(doc.y), lng: parseFloat(doc.x), address: doc.address_name, name: doc.place_name,
    categoryGroup: doc.category_group_code,
    phone: doc.phone || undefined,
    kakaoPlaceId: doc.id || undefined,
  }
}
