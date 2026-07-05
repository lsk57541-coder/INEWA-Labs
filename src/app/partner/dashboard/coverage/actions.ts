'use server'

import { createClient } from '@/lib/supabase/server'
import { getMyPartner } from '../actions'
import type { Place } from '../places/PlaceRow'

// route.ts:568 extractYoutubeId와 동일 로직(11자 videoId; shorts/embed/raw/raw-id 커버).
// DB엔 videoId 파생 컬럼이 없어 앱에서 추출하는 게 코드 전역 관례(bulkRequestPlaces·search route)
// — 여기서도 같은 규칙을 재사용해 places.video_url ↔ partner_videos.video_id를 조인한다.
function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null)
}

export type ExtractStatus = 'pending' | 'done' | 'empty' | 'error'

export interface VideoCoverage {
  video_id: string
  title: string | null
  published_at: string | null
  extract_status: ExtractStatus
  total: number         // 총 장소수(deleted 제외)
  visible: number       // active & 좌표 있음 → 지도 노출
  pendingCoord: number  // active & 좌표 없음 → 좌표대기
  hidden: number        // hidden(비공개)
}

// 채널 전체 영상(partner_videos) + 장소(places)를 조인해 영상별 커버리지를 산출.
// ★장소 0개 영상까지 전부 포함(이 화면의 존재 이유). published_at 최신순.
export async function getMyVideoCoverage(): Promise<VideoCoverage[]> {
  const partner = await getMyPartner()
  const supabase = await createClient()

  const [{ data: videos }, { data: places }] = await Promise.all([
    supabase
      .from('partner_videos')
      .select('video_id, title, published_at, extract_status')
      .eq('partner_id', partner.id)
      .order('published_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('places')
      .select('video_url, latitude, longitude, status')
      .eq('partner_id', partner.id)
      .neq('status', 'deleted'),
  ])

  // videoId → 장소들 Map (in-memory 조인; 파트너당 영상 수백~2천 + 장소 수백 규모라 가볍다).
  const byVideo = new Map<string, { latitude: number | null; longitude: number | null; status: string }[]>()
  for (const p of places ?? []) {
    const vid = extractYoutubeId(p.video_url)
    if (!vid) continue
    const arr = byVideo.get(vid)
    if (arr) arr.push(p)
    else byVideo.set(vid, [p])
  }

  return (videos ?? []).map((v) => {
    const rows = byVideo.get(v.video_id) ?? []
    let visible = 0
    let pendingCoord = 0
    let hidden = 0
    for (const r of rows) {
      if (r.status === 'hidden') hidden++
      else if (r.status === 'active') {
        if (r.latitude != null && r.longitude != null) visible++
        else pendingCoord++
      }
      // reviewing/rejected 등은 total엔 잡히되 세부 카운트엔 안 들어감(현 데이터엔 거의 없음).
    }
    return {
      video_id: v.video_id,
      title: v.title,
      published_at: v.published_at,
      extract_status: (v.extract_status ?? 'pending') as ExtractStatus,
      total: rows.length,
      visible,
      pendingCoord,
      hidden,
    }
  })
}

// 드릴다운: 한 영상의 장소들(PlaceRow용 전체 컬럼). places/page.tsx와 동일 컬럼셋 + video-info의
// videoId 매칭 방식(ilike %videoId%) 재사용.
export async function getVideoPlaces(videoId: string): Promise<Place[]> {
  const partner = await getMyPartner()
  const supabase = await createClient()
  const { data } = await supabase
    .from('places')
    .select('id, name, address, category, video_url, status, click_count, rejection_reason, verification_status, source, video_title')
    .eq('partner_id', partner.id)
    .neq('status', 'deleted')
    .ilike('video_url', `%${videoId}%`)
    .order('created_at', { ascending: false })
  return (data ?? []) as Place[]
}
