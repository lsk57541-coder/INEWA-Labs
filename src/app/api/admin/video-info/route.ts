import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    return null
  } catch {
    return null
  }
}

interface VideoItem {
  id: string
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    thumbnails: { medium?: { url: string }; default?: { url: string } }
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: '유효하지 않은 YouTube URL입니다' }, { status: 400 })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

  const params = new URLSearchParams({ part: 'snippet', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'YouTube API 오류' }, { status: 500 })

  const json = await res.json() as { items?: VideoItem[] }
  const item = json.items?.[0]
  if (!item) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  return NextResponse.json({
    videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
    channel: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
  })
}
