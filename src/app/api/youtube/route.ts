import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = request.nextUrl.searchParams.get('q')
  if (!q) {
    return NextResponse.json({ error: 'Missing query param: q' }, { status: 400 })
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q,
    maxResults: '10',
    key: process.env.YOUTUBE_API_KEY!,
  })

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`, { next: { revalidate: 300 } })
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: 'YouTube API error', detail: data }, { status: 500 })
  }

  const videos = data.items.map((item: YouTubeSearchItem) => ({
    youtube_id: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium.url,
    channel: item.snippet.channelTitle,
    published_at: item.snippet.publishedAt,
  }))

  return NextResponse.json({ videos })
}

interface YouTubeSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    thumbnails: { medium: { url: string } }
  }
}
