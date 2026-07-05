// 카카오 재검색으로 기존 장소에 phone/kakao_place_id/category_group_code를 소급 채우는 매처.
// places·locations 두 테이블이 공유(이원화 로직 중복 방지). 저장 좌표 50m 이내 결과만 채택(오매칭 가드),
// 미매칭이면 null 반환 → 호출부가 스킵(해당 행은 카드에서 좌표 딥링크로 폴백).

const MATCH_RADIUS_M = 50
export const KAKAO_MATCH_RADIUS_M = MATCH_RADIUS_M

export interface KakaoMatch {
  kakao_place_id: string
  phone: string | null
  category_group_code: string | null
}

interface KakaoDoc {
  id: string
  x: string
  y: string
  place_name: string
  road_address_name: string
  address_name: string
  phone: string
  category_group_code: string
}

function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 주소에서 행정구역(구/동) 힌트 추출 — 동명 구분용 검색어 보강(PlaceInfoPanel.extractRegion과 동일 규칙).
function regionHint(address: string | null): string {
  if (!address) return ''
  return address.split(/\s+/).filter((t) => /(구|군|동|읍|면)$/.test(t)).slice(0, 2).join(' ')
}

async function kakaoKeyword(query: string): Promise<KakaoDoc[]> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key || !query.trim()) return []
  const qs = new URLSearchParams({ query: query.trim(), size: '15' })
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${qs}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return []
  const json = (await res.json()) as { documents?: KakaoDoc[] }
  return json.documents ?? []
}

// 상호명(+지역 힌트)으로 카카오 재검색 → 저장 좌표 50m 이내 '최근접' 결과의 3필드 반환. 없으면 null.
export async function matchKakaoPlace(
  name: string,
  address: string | null,
  lat: number,
  lng: number,
): Promise<KakaoMatch | null> {
  if (!name?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const region = regionHint(address)
  let docs = await kakaoKeyword(region ? `${region} ${name}` : name)
  if (docs.length === 0 && region) docs = await kakaoKeyword(name) // 지역 힌트가 되레 방해면 이름만 재시도

  let best: { doc: KakaoDoc; dist: number } | null = null
  for (const d of docs) {
    const dy = parseFloat(d.y)
    const dx = parseFloat(d.x)
    if (!Number.isFinite(dy) || !Number.isFinite(dx)) continue
    const dist = distMeters(lat, lng, dy, dx)
    if (dist <= MATCH_RADIUS_M && (!best || dist < best.dist)) best = { doc: d, dist }
  }
  if (!best) return null // 50m 이내 매칭 없음 → 스킵(null 유지 → 폴백)
  return {
    kakao_place_id: best.doc.id,
    phone: best.doc.phone || null,
    category_group_code: best.doc.category_group_code || null,
  }
}
