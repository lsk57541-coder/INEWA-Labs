// Supabase Edge Function — 주 1회(pg_cron) 실행. 저장된 YouTube 통계
// (조회수/구독자수)를 videos.list/channels.list로 재조회해 갱신한다.
// YouTube API 컴플라이언스 "통계 30일 룰"(저장 통계는 30일 이내 갱신) 대응.
//
// 배포 + 스케줄은 supabase/sql/refresh_stats_cron.sql 참고(monthly-report와
// 동일 절차 — 이 채팅/자동배포 아님, CLI로 수동 배포).
//
// 갱신 컬럼: view_count, subscriber_count, stats_updated_at 만.
//   published_at·좌표·장소명 등 불변 메타는 절대 건드리지 않는다.
// 삭제/비공개 영상(videos.list 무응답): 스킵 + missing 로깅(0으로 덮어쓰지 않음).
// channels.list 무응답: subscriber_count 기존값 유지(갱신 생략).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1'

const YT_BASE = 'https://www.googleapis.com/youtube/v3'

// search/route.ts extractYoutubeId와 동일 로직(11자 id 추출).
function extractYoutubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null)
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// >1000행 대비 페이지네이션 select.
async function selectAll<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  build?: (q: any) => any,
): Promise<T[]> {
  const page = 1000
  let from = 0
  let rows: T[] = []
  while (true) {
    let q = db.from(table).select(columns).range(from, from + page - 1)
    if (build) q = build(q)
    const { data, error } = await q
    if (error) throw new Error(`${table} select 실패: ${error.message}`)
    rows = rows.concat((data ?? []) as T[])
    if (!data || data.length < page) break
    from += page
  }
  return rows
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ytKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!ytKey) {
    return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const db = createClient(supabaseUrl, serviceRoleKey)
  const nowIso = new Date().toISOString()
  let quotaUnits = 0

  // 1) 대상 수집
  const videoRows = await selectAll<{ youtube_id: string | null }>(
    db, 'videos', 'youtube_id',
  )
  const placeRows = await selectAll<{ id: string; video_url: string | null }>(
    db, 'places', 'id, video_url', (q) => q.neq('status', 'deleted'),
  )
  const partnerRows = await selectAll<{ id: string; channel_id: string | null }>(
    db, 'partners', 'id, channel_id', (q) => q.not('channel_id', 'is', null),
  )

  const placeVid = new Map<string, string>() // place.id -> youtube_id
  for (const p of placeRows) {
    const vid = extractYoutubeId(p.video_url ?? '')
    if (vid) placeVid.set(p.id, vid)
  }

  const uniqVideoIds = [...new Set([
    ...videoRows.map((v) => v.youtube_id).filter(Boolean) as string[],
    ...placeVid.values(),
  ])]

  // 2) videos.list(snippet,statistics) 50개 배치 → viewCount + channelId
  const meta = new Map<string, { viewCount: number; channelId: string | null }>()
  for (const ids of chunk(uniqVideoIds, 50)) {
    const params = new URLSearchParams({ part: 'snippet,statistics', id: ids.join(','), key: ytKey })
    const res = await fetch(`${YT_BASE}/videos?${params}`)
    quotaUnits++
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'videos.list failed', status: res.status, body: await res.text() }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }
    const json = await res.json() as { items?: { id: string; snippet?: { channelId?: string }; statistics?: { viewCount?: string } }[] }
    for (const it of json.items ?? []) {
      meta.set(it.id, {
        viewCount: parseInt(it.statistics?.viewCount ?? '0', 10),
        channelId: it.snippet?.channelId ?? null,
      })
    }
  }
  const missing = uniqVideoIds.filter((id) => !meta.has(id)) // 삭제/비공개 추정

  // 3) channels.list(statistics) 50개 배치 → subscriberCount
  //    대상 = 영상 응답의 channelId ∪ 파트너 channel_id
  const channelIds = [...new Set([
    ...[...meta.values()].map((m) => m.channelId).filter(Boolean) as string[],
    ...partnerRows.map((p) => p.channel_id).filter(Boolean) as string[],
  ])]
  const subMap = new Map<string, number>()
  for (const ids of chunk(channelIds, 50)) {
    const params = new URLSearchParams({ part: 'statistics', id: ids.join(','), key: ytKey })
    const res = await fetch(`${YT_BASE}/channels?${params}`)
    quotaUnits++
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'channels.list failed', status: res.status, body: await res.text() }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }
    const json = await res.json() as { items?: { id: string; statistics?: { subscriberCount?: string } }[] }
    for (const it of json.items ?? []) {
      subMap.set(it.id, parseInt(it.statistics?.subscriberCount ?? '0', 10))
    }
  }

  // 4) 덮어쓰기 UPDATE (NULL 가드 없음 — 갱신이 목적).
  //    subscriber_count는 채널 응답 있을 때만 세팅(무응답 시 기존값 유지).
  let videosUpdated = 0
  const uniqVideoRowIds = [...new Set(videoRows.map((v) => v.youtube_id).filter(Boolean) as string[])]
  for (const id of uniqVideoRowIds) {
    const m = meta.get(id)
    if (!m) continue // 삭제 영상 스킵 — 기존 값 보존
    const patch: Record<string, unknown> = { view_count: m.viewCount, stats_updated_at: nowIso }
    const sub = m.channelId ? subMap.get(m.channelId) : undefined
    if (sub !== undefined) patch.subscriber_count = sub
    const { error, count } = await db.from('videos').update(patch, { count: 'exact' }).eq('youtube_id', id)
    if (error) { console.error(`videos update 실패 ${id}: ${error.message}`); continue }
    videosUpdated += count ?? 0
  }

  let placesUpdated = 0
  for (const p of placeRows) {
    const vid = placeVid.get(p.id)
    if (!vid) continue
    const m = meta.get(vid)
    if (!m) continue // 삭제 영상 스킵
    const patch: Record<string, unknown> = { view_count: m.viewCount, stats_updated_at: nowIso }
    const sub = m.channelId ? subMap.get(m.channelId) : undefined
    if (sub !== undefined) patch.subscriber_count = sub
    const { error } = await db.from('places').update(patch).eq('id', p.id)
    if (error) { console.error(`places update 실패 ${p.id}: ${error.message}`); continue }
    placesUpdated++
  }

  let partnersUpdated = 0
  for (const pt of partnerRows) {
    if (!pt.channel_id) continue
    const sub = subMap.get(pt.channel_id)
    if (sub === undefined) continue // 채널 삭제/비공개 → 스킵, 기존값 유지
    const { error } = await db.from('partners').update({ subscriber_count: sub, stats_updated_at: nowIso }).eq('id', pt.id)
    if (error) { console.error(`partners update 실패 ${pt.id}: ${error.message}`); continue }
    partnersUpdated++
  }

  if (missing.length > 0) {
    console.log(`[refresh-stats] 삭제/비공개 추정 ${missing.length}개 스킵: ${missing.slice(0, 50).join(', ')}`)
  }

  return new Response(JSON.stringify({
    ok: true,
    quotaUnits,
    uniqueVideos: uniqVideoIds.length,
    uniqueChannels: channelIds.length,
    videosUpdated,
    placesUpdated,
    partnersUpdated,
    missingCount: missing.length,
    missing: missing.slice(0, 50),
  }), { headers: { 'Content-Type': 'application/json' } })
})
