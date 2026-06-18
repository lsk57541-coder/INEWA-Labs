import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const list = req.nextUrl.searchParams.get('list') === '1'
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const key = process.env.KAKAO_REST_API_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=${list ? 5 : 1}`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) return NextResponse.json({ error: '주소 검색 실패' }, { status: 500 })

  const json = await res.json() as {
    documents: { y: string; x: string; place_name: string; address_name: string; road_address_name: string }[]
  }

  if (list) {
    return NextResponse.json({
      results: json.documents.map((doc) => ({
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        name: doc.place_name || doc.address_name,
        address: doc.road_address_name || doc.address_name,
      })),
    })
  }

  const doc = json.documents?.[0]
  if (!doc) return NextResponse.json({ error: '검색 결과 없음' }, { status: 404 })

  return NextResponse.json({
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
    name: doc.place_name || doc.address_name,
  })
}
