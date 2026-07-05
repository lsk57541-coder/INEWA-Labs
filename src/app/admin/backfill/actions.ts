'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { matchKakaoPlace } from '@/lib/kakaoBackfill'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
}

export type BackfillTable = 'places' | 'locations'
// 테이블별 좌표 컬럼명 차이(places=latitude/longitude, locations=lat/lng). 상수 맵이라 SQL 인젝션 무관.
const COORD: Record<BackfillTable, { lat: string; lng: string }> = {
  places: { lat: 'latitude', lng: 'longitude' },
  locations: { lat: 'lat', lng: 'lng' },
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('서버 설정 오류: 서비스 키가 없습니다.')
  return createServiceClient(url, key)
}

export interface TableCounts { backfilled: number; remaining: number }
export interface BackfillCounts { places: TableCounts; locations: TableCounts }

// 초기/갱신 카운트: 채워진 수 / 남은(좌표 있고 kakao_place_id null) 수.
export async function getBackfillCounts(): Promise<BackfillCounts> {
  await requireAdmin()
  const admin = adminClient()
  const out = {} as BackfillCounts
  for (const t of ['places', 'locations'] as BackfillTable[]) {
    const c = COORD[t]
    const { count: backfilled } = await admin.from(t).select('id', { count: 'exact', head: true }).not('kakao_place_id', 'is', null)
    const { count: remaining } = await admin.from(t).select('id', { count: 'exact', head: true }).is('kakao_place_id', null).not(c.lat, 'is', null)
    out[t] = { backfilled: backfilled ?? 0, remaining: remaining ?? 0 }
  }
  return out
}

export interface BackfillResult {
  table: BackfillTable
  processed: number
  matched: number
  skipped: number
  remaining: number
}

// 한 배치(기본 100건) 백필: kakao_place_id null인 행을 카카오 재검색해 50m 가드 통과분만 3필드 UPDATE.
// 멱등(이미 채워진 행은 조회 대상 아님). 미매칭은 스킵(null 유지 → 폴백).
export async function backfillKakaoBatch(table: BackfillTable, limit = 100): Promise<BackfillResult> {
  await requireAdmin()
  const admin = adminClient()
  const c = COORD[table]

  const { data, error } = await admin
    .from(table)
    .select(`id, name, address, ${c.lat}, ${c.lng}`)
    .is('kakao_place_id', null)
    .not(c.lat, 'is', null)
    .limit(limit)
  if (error) throw new Error(error.message)
  // 동적 컬럼 select라 supabase 타입 추론이 안 됨 → unknown 경유 캐스팅.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

  let matched = 0
  let skipped = 0
  for (const r of rows) {
    const lat = r[c.lat] as number
    const lng = r[c.lng] as number
    const m = await matchKakaoPlace(String(r.name ?? ''), (r.address as string | null) ?? null, lat, lng)
    if (!m) {
      skipped++
      continue
    }
    const { error: upErr } = await admin
      .from(table)
      .update({ kakao_place_id: m.kakao_place_id, phone: m.phone, category_group_code: m.category_group_code })
      .eq('id', r.id as string)
    if (upErr) skipped++
    else matched++
  }

  const { count: remaining } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('kakao_place_id', null)
    .not(c.lat, 'is', null)

  return { table, processed: rows.length, matched, skipped, remaining: remaining ?? 0 }
}
