import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface VideoItem {
  id: string
  snippet: {
    title: string
    channelTitle: string
    channelId: string
    publishedAt: string
    thumbnails: { medium?: { url: string }; default?: { url: string } }
  }
  statistics?: { viewCount?: string }
}

// 파트너용 영상 미리보기. admin/video-info의 복제이되 두 가지를 파트너 규칙으로 바꿈:
//  ① 권한: admin-role 검사 대신 partner.channel_id 일치 검사(본인 채널 영상만) — 본인채널 제한 유지.
//  ② 중복: videos.youtube_id가 아니라 places(본인 partner_id + 이 영상 video_url) 카운트.
//     파트너는 덮어쓰기 없음 → 정보성 안내용(이미 N개 등록).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id, channel_id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId param' }, { status: 400 })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

  // snippet,statistics는 동일 호출(1유닛)이라 조회수는 추가 quota 0.
  const params = new URLSearchParams({ part: 'snippet,statistics', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'YouTube API 오류' }, { status: 500 })

  const json = await res.json() as { items?: VideoItem[] }
  const item = json.items?.[0]
  if (!item) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  // 본인 채널 제한 — extract-places와 동일 가드. 남의 영상 미리보기/등록 방지.
  if (item.snippet.channelId !== partner.channel_id) {
    return NextResponse.json({ error: '본인 채널 영상만 등록할 수 있습니다' }, { status: 403 })
  }

  const viewCount = parseInt(item.statistics?.viewCount ?? '0', 10)

  // 이미 이 영상으로 등록한 장소 수(정보성). RLS로 본인 places만 보이지만 partner_id도 명시.
  // video_url에 videoId가 포함되는지로 매칭(watch?v=ID / youtu.be/ID 모두 커버). YouTube quota 무관.
  const { count } = await supabase
    .from('places')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partner.id)
    .ilike('video_url', `%${videoId}%`)
    .neq('status', 'deleted')  // 삭제한 장소는 "이미 N개 등록" 안내 카운트에서 제외.
  const registeredCount = count ?? 0

  return NextResponse.json({
    videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
    channel: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    viewCount,
    registeredCount,
  })
}
