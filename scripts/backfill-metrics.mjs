// 제주 데모(videos 테이블) 조회수·구독자수 backfill (3단계, 일회성·로컬 실행 전용).
//   dry-run(기본):  node scripts/backfill-metrics.mjs
//   실제 적용:      node scripts/backfill-metrics.mjs --apply
//
// view_count IS NULL 인 행만 처리(재실행 안전·부분성공 보존). view_count/subscriber_count
// 두 컬럼만 갱신 — 좌표/장소명/published_at 등 기존 데이터는 건드리지 않는다.
// quota: videos.list(snippet,statistics) + channels.list(statistics), 각 50개/유닛.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')

// --- .env.local 직접 파싱 (standalone node라 Next가 안 읽어줌) ---
function loadEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const out = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const YT_KEY = env.YOUTUBE_API_KEY
if (!SUPABASE_URL || !SERVICE_KEY || !YT_KEY) {
  console.error('환경변수 누락(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / YOUTUBE_API_KEY)')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY)

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

let quotaUnits = 0

async function main() {
  console.log(`=== backfill-metrics (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)

  // 1) view_count NULL 행 전부 수집 (페이지네이션, >1000행)
  let rows = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await db
      .from('videos')
      .select('youtube_id')
      .is('view_count', null)
      .range(from, from + page - 1)
    if (error) { console.error('select err:', error.message); process.exit(1) }
    rows = rows.concat(data)
    if (data.length < page) break
    from += page
  }
  const uniqVideoIds = [...new Set(rows.map(r => r.youtube_id).filter(Boolean))]
  console.log(`대상 행: ${rows.length} | 고유 영상: ${uniqVideoIds.length}`)
  if (uniqVideoIds.length === 0) { console.log('채울 대상 없음. 종료.'); return }

  // 2) videos.list (snippet,statistics) 배치 → youtube_id별 viewCount + channelId
  const meta = new Map() // youtube_id -> { viewCount, channelId }
  for (const ids of chunk(uniqVideoIds, 50)) {
    const params = new URLSearchParams({ part: 'snippet,statistics', id: ids.join(','), key: YT_KEY })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
    quotaUnits++
    if (!res.ok) { console.error('videos.list 실패:', res.status, await res.text()); process.exit(1) }
    const json = await res.json()
    for (const it of json.items ?? []) {
      meta.set(it.id, {
        viewCount: parseInt(it.statistics?.viewCount ?? '0', 10),
        channelId: it.snippet?.channelId ?? null,
      })
    }
  }
  const missing = uniqVideoIds.filter(id => !meta.has(id))
  console.log(`videos.list 응답: ${meta.size}/${uniqVideoIds.length} (삭제/비공개 추정 ${missing.length}개는 스킵→재실행 시 재시도)`)

  // 3) channels.list (statistics) 배치 → channelId별 subscriberCount
  const channelIds = [...new Set([...meta.values()].map(m => m.channelId).filter(Boolean))]
  const subMap = new Map() // channelId -> subscriberCount
  for (const ids of chunk(channelIds, 50)) {
    const params = new URLSearchParams({ part: 'statistics', id: ids.join(','), key: YT_KEY })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
    quotaUnits++
    if (!res.ok) { console.error('channels.list 실패:', res.status, await res.text()); process.exit(1) }
    const json = await res.json()
    for (const it of json.items ?? []) {
      subMap.set(it.id, parseInt(it.statistics?.subscriberCount ?? '0', 10))
    }
  }
  console.log(`고유 채널: ${channelIds.length} | channels.list 응답: ${subMap.size}`)

  // 4) youtube_id별 update (NULL 가드). dry-run이면 로그만.
  let updatedRows = 0
  let updatedVideos = 0
  let sampleShown = 0
  for (const id of uniqVideoIds) {
    const m = meta.get(id)
    if (!m) continue // 삭제 영상 스킵
    const view_count = m.viewCount
    const subscriber_count = m.channelId ? (subMap.get(m.channelId) ?? 0) : 0
    if (sampleShown < 6) {
      console.log(`  샘플 ${id}: view=${view_count} sub=${subscriber_count} ch=${m.channelId}`)
      sampleShown++
    }
    if (APPLY) {
      const { data, error } = await db
        .from('videos')
        .update({ view_count, subscriber_count })
        .eq('youtube_id', id)
        .is('view_count', null)
        .select('id')
      if (error) { console.error(`update 실패 ${id}:`, error.message); continue }
      updatedRows += data?.length ?? 0
      updatedVideos++
    }
  }

  console.log('--- 요약 ---')
  console.log(`사용 quota: ${quotaUnits} 유닛 (videos.list + channels.list)`)
  if (APPLY) {
    console.log(`갱신: 영상 ${updatedVideos}개 / 행 ${updatedRows}개`)
  } else {
    const plannedRows = rows.filter(r => meta.has(r.youtube_id)).length
    console.log(`[DRY-RUN] 쓰기 0. 적용 시 예상: 영상 ${meta.size - missing.length + (missing.length ? 0 : 0)}개, 행 ~${plannedRows}개`)
    console.log('실제 적용하려면: node scripts/backfill-metrics.mjs --apply')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
