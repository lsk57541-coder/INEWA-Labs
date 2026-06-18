import { NextRequest, NextResponse } from 'next/server'

export interface ChannelSuggestion {
  channelId: string
  title: string
  thumbnail: string
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ results: [] })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ results: [] })

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'channel',
    maxResults: '5',
    key,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) return NextResponse.json({ results: [] })

  const json = await res.json() as {
    items?: { id: { channelId: string }; snippet: { title: string; thumbnails: { default: { url: string } } } }[]
  }

  const results: ChannelSuggestion[] = (json.items ?? []).map((item) => ({
    channelId: item.id.channelId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.default.url,
  }))

  return NextResponse.json({ results })
}
