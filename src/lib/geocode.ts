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
