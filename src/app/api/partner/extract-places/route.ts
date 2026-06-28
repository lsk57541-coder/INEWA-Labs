import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVideoSnippet, extractPlaceList, extractWithClaude } from '@/lib/extractPlaces'

export async function GET(request: NextRequest) {
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

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId param' }, { status: 400 })

  const snippet = await getVideoSnippet(videoId)
  if (!snippet) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  if (snippet.channelId !== partner.channel_id) {
    return NextResponse.json({ error: '본인 채널 영상만 등록할 수 있습니다' }, { status: 403 })
  }

  let places = extractPlaceList(snippet.title, snippet.description)
  if (places.length === 0) {
    places = await extractWithClaude(snippet.title, snippet.description)
  }

  // 입력 시 저장(2단계)용 영상 메타 — 추가 quota 없이 getVideoSnippet에서 함께 옴.
  return NextResponse.json({ places, viewCount: snippet.viewCount, publishedAt: snippet.publishedAt })
}
