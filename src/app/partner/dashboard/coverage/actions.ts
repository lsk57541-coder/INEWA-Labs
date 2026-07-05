'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getMyPartner } from '../actions'
import { fetchChannelUploads } from '@/lib/channelUploads'
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
    .select('id, name, address, category, video_url, status, click_count, latitude, longitude, rejection_reason, verification_status, source, video_title')
    .eq('partner_id', partner.id)
    .neq('status', 'deleted')
    .ilike('video_url', `%${videoId}%`)
    .order('created_at', { ascending: false })
  return (data ?? []) as Place[]
}

export interface SyncResult {
  mode: 'full' | 'incremental'
  synced: number
}

// 파트너 채널의 전체 업로드 영상을 partner_videos에 동기화(playlistItems, 저비용).
// ★배타적 upsert: payload에 콘텐츠 4필드(title/thumbnail/published_at/synced_at)만 넣어
//   extract_status/extracted_at은 절대 안 덮는다(S4 기록 보존 — 재추출 방지 유지).
// 증분: 이미 content-동기화된(title 있는) 영상을 최신순으로 만나면 중단(신규만 ~2유닛).
//   추출 스텁(title null)·sim 행(id가 실 업로드에 없음)은 stopAt에 안 걸려 정상 처리.
export async function syncMyChannel(): Promise<SyncResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: partner } = await supabase
    .from('partners')
    .select('id, channel_id, is_demo')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!partner) throw new Error('파트너 정보를 찾을 수 없습니다.')
  if (!partner.channel_id) throw new Error('채널이 연동되지 않았어요. 설정에서 채널을 연동해 주세요.')

  const { data: syncedRows } = await supabase
    .from('partner_videos')
    .select('video_id')
    .eq('partner_id', partner.id)
    .not('title', 'is', null)
  const stopAt = new Set((syncedRows ?? []).map((r) => r.video_id))
  const mode: 'full' | 'incremental' = stopAt.size === 0 ? 'full' : 'incremental'

  const videos = await fetchChannelUploads(partner.channel_id, { stopAt })
  if (videos.length === 0) {
    revalidatePath('/partner/dashboard/coverage')
    return { mode, synced: 0 }
  }

  const now = new Date().toISOString()
  const rows = videos.map((v) => ({
    partner_id: partner.id,
    video_id: v.videoId,
    title: v.title || null,
    thumbnail: v.thumbnail || null,
    published_at: v.publishedAt,
    synced_at: now,
    is_demo: partner.is_demo,
    // extract_status/extracted_at 미포함 → on conflict 시 SET 절에 없어 보존.
  }))

  // 쓰기는 service_role(RLS는 select만 열려 있음). video_referrals 등과 동일 패턴.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('서버 설정 오류로 동기화할 수 없어요.')
  const admin = createServiceClient(url, serviceKey)
  const { error } = await admin.from('partner_videos').upsert(rows, { onConflict: 'partner_id,video_id' })
  if (error) throw new Error(error.message)

  revalidatePath('/partner/dashboard/coverage')
  return { mode, synced: videos.length }
}
