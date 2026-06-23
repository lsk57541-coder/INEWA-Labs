import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('channel_id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const params = new URLSearchParams({
    channelId: partner.channel_id,
    type: 'video',
    order: 'date',
    maxResults: '20',
    part: 'snippet',
    key,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: '영상 목록을 불러올 수 없습니다' }, { status: 500 })

  const json = await res.json() as {
    items?: {
      id: { videoId: string }
      snippet: { title: string; thumbnails: { medium: { url: string } }; publishedAt: string }
    }[]
  }

  const videos = (json.items ?? []).map(item => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium.url,
    publishedAt: item.snippet.publishedAt,
  }))

  return NextResponse.json({ videos })
}
