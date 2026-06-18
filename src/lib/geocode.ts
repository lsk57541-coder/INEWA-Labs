export interface GeoResult {
  lat: number
  lng: number
  address: string
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return null

  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) return null

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

export interface PlaceDetails {
  name: string
  category: string
  address: string
  phone?: string
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
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) return null

  const json = await res.json() as {
    documents: {
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
  }
}

export async function geocodeKorean(place: string): Promise<GeoResult | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return null

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(place)}&size=1`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) return null

  const json = await res.json() as { documents: { y: string; x: string; address_name: string }[] }
  const doc = json.documents?.[0]
  if (!doc) return null

  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x), address: doc.address_name }
}
