import { NextRequest, NextResponse } from 'next/server'

export interface ChannelSuggestion {
  channelId: string
  title: string
  thumbnail: string
  subscriberCount?: number
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ results: [] })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ results: [] })

  // search.list(type=channel) = 100유닛. 버튼 검색 시 1회만 호출(타이핑 자동검색 제거).
  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'channel',
    maxResults: '20',
    key,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) return NextResponse.json({ results: [] })

  const json = await res.json() as {
    items?: { id: { channelId: string }; snippet: { title: string; thumbnails: { default: { url: string } } } }[]
  }

  const base: ChannelSuggestion[] = (json.items ?? []).map((item) => ({
    channelId: item.id.channelId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.default.url,
  }))

  // 구독자수 보강: channels.list(statistics) 1회(+1유닛, 최대 50채널/유닛)로 일괄 조회.
  const ids = base.map((c) => c.channelId)
  if (ids.length > 0) {
    const chParams = new URLSearchParams({ part: 'statistics', id: ids.join(','), key })
    const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?${chParams}`)
    if (chRes.ok) {
      const chJson = await chRes.json() as { items?: { id: string; statistics?: { subscriberCount?: string } }[] }
      const subMap = new Map<string, number>()
      for (const it of chJson.items ?? []) {
        subMap.set(it.id, parseInt(it.statistics?.subscriberCount ?? '0', 10))
      }
      for (const c of base) c.subscriberCount = subMap.get(c.channelId)
    }
  }

  return NextResponse.json({ results: base })
}
