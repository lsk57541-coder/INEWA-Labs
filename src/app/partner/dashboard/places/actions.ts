'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 재등록 중복 판정용 헬퍼 2종.
// ① videoId 추출 — video-info/route.ts의 매칭 방식(watch?v= / youtu.be 둘 다 커버)과 동일.
//    URL이 없거나 비-YouTube면 null → 영상 기준 매칭 불가 → 신규 insert로 흘러감.
function extractVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    return null
  } catch { return null }
}
// ② 이름 정규화 — ExtractPlacesForm.tsx의 normName과 동일(공백·기호 제거, 소문자).
//    ★매칭키에 name을 넣어 "1영상 다장소(다른 이름)"는 미매칭 → 각각 insert(정상)되게 함.
function normName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}

async function requireMyPartnerId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!partner) throw new Error('파트너 정보를 찾을 수 없습니다.')
  return partner.id
}

// 검증 이벤트를 verification_logs에 append(시계열 누적 — 실사 대비 검증 활성도 근거).
// ★베스트에포트: consent_logs 패턴과 동일하게 throw하지 않는다 — 로그 실패가 검증 자체를
// 막으면 안 됨. 검증의 본 동작(verification_status/verified_at 덮어쓰기 update)은 호출부에서
// 이미 끝난 뒤 호출된다. 인증 클라이언트로 INSERT → RLS "partner inserts own" 통과.
async function logVerification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    placeId: string
    partnerId: string
    result: 'confirmed' | 'rejected'
    prevStatus: string | null
    newStatus: 'confirmed' | 'rejected'
    isDemo: boolean
  }
): Promise<void> {
  const { error } = await supabase.from('verification_logs').insert({
    place_id: args.placeId,
    partner_id: args.partnerId,
    result: args.result,
    prev_status: args.prevStatus,
    new_status: args.newStatus,
    is_demo: args.isDemo,
    // created_at은 DB 기본값(now()) 사용
  })
  if (error) console.error(`[logVerification] insert failed (place=${args.placeId}):`, error.message)
}

export interface PlaceInput {
  name: string
  address?: string
  category?: string
  video_url?: string
  latitude?: number
  longitude?: number
}

export async function addPlace(data: PlaceInput) {
  if (!data.name.trim()) throw new Error('상호명을 입력해주세요.')

  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  const { error } = await supabase.from('places').insert({
    partner_id: partnerId,
    name: data.name.trim(),
    address: data.address?.trim() || null,
    category: data.category?.trim() || null,
    video_url: data.video_url?.trim() || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    status: 'active', // 즉시 공개(바로 가입 취지). 사후 가드는 hide(숨김) 유지.
  })
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

// RLS (partner manages own places) is the real backstop, but the explicit
// .eq('partner_id', ...) here means a typo'd id just silently affects zero
// rows instead of relying solely on the DB to reject it.
export async function updatePlace(id: string, data: Partial<PlaceInput>) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.address !== undefined) update.address = data.address?.trim() || null
  if (data.category !== undefined) update.category = data.category?.trim() || null
  if (data.video_url !== undefined) update.video_url = data.video_url?.trim() || null
  if (data.latitude !== undefined) update.latitude = data.latitude
  if (data.longitude !== undefined) update.longitude = data.longitude
  update.updated_at = new Date().toISOString() // 파트너 콘텐츠 수정 시점 기록

  const { error } = await supabase.from('places').update(update).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

export async function hidePlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  const { error } = await supabase.from('places').update({ status: 'hidden', updated_at: new Date().toISOString() }).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

// 파트너 장소 검증 — 본인 장소만(.eq('partner_id') 명시 + RLS "partner manages own places" 이중).
// confirm: 맞다고 확인(공개 유지). reject: 잘못된 추출 → 검색/지도에서 숨김(status='hidden').
export async function confirmPlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  // 로그용 사전 캡처(정확성): 검증 직전 상태 + 파트너 데모 여부. 읽기 전용이라 본 동작에 영향 없음.
  const { data: place } = await supabase
    .from('places').select('verification_status').eq('id', id).eq('partner_id', partnerId).maybeSingle()
  const { data: partner } = await supabase
    .from('partners').select('is_demo').eq('id', partnerId).maybeSingle()

  // ↓ 검증 본 동작(verification_status/verified_at 덮어쓰기) — 기존과 동일.
  // 단 번복(rejected→confirmed) 시에만 status='hidden'을 'active'로 복원한다.
  // rejectPlace는 reject 시 status='hidden'으로 숨기므로, "검증 reject로 인한 hidden"은
  // 현재 verification_status==='rejected'로 식별 가능 → 그것만 복원(의도적 hidePlace는 건드리지 않음).
  const restoreToActive = place?.verification_status === 'rejected'
  const patch: Record<string, unknown> = { verification_status: 'confirmed', verified_at: new Date().toISOString() }
  if (restoreToActive) patch.status = 'active'

  const { error } = await supabase
    .from('places')
    .update(patch)
    .eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)

  // 추가: 검증 이벤트 append(베스트에포트).
  await logVerification(supabase, {
    placeId: id, partnerId, result: 'confirmed',
    prevStatus: place?.verification_status ?? null, newStatus: 'confirmed',
    isDemo: partner?.is_demo ?? false,
  })

  revalidatePath('/partner/dashboard/places')
}

export async function rejectPlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  // 로그용 사전 캡처(정확성): 검증 직전 상태 + 파트너 데모 여부. 읽기 전용이라 본 동작에 영향 없음.
  const { data: place } = await supabase
    .from('places').select('verification_status').eq('id', id).eq('partner_id', partnerId).maybeSingle()
  const { data: partner } = await supabase
    .from('partners').select('is_demo').eq('id', partnerId).maybeSingle()

  // ↓ 기존 동작 그대로 — 거부 = 잘못된 장소 → 검증상태 rejected + status='hidden'으로 검색/지도에서 즉시 제외.
  const { error } = await supabase
    .from('places')
    .update({ verification_status: 'rejected', verified_at: new Date().toISOString(), status: 'hidden' })
    .eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)

  // 추가: 검증 이벤트 append(베스트에포트).
  await logVerification(supabase, {
    placeId: id, partnerId, result: 'rejected',
    prevStatus: place?.verification_status ?? null, newStatus: 'rejected',
    isDemo: partner?.is_demo ?? false,
  })

  revalidatePath('/partner/dashboard/places')
}

export interface BulkPlaceInput {
  name: string
  address?: string
  category?: string
  video_url?: string
  latitude?: number
  longitude?: number
  view_count?: number       // 영상 조회수(2단계 저장 → 검색 필터)
  published_at?: string     // 영상 업로드일(2단계 저장 → 검색 필터)
  source?: 'coords' | 'timestamp' | 'ai' | 'list'  // 추출 출처(엔진 반환값). 수동 행은 생략 → null 저장.
}

// 반환: succeeded=신규 insert 수, updated=기존 행 갱신 수(재등록). 중복 방지의 핵심 경로.
export async function bulkRequestPlaces(places: BulkPlaceInput[]): Promise<{ succeeded: number; updated: number; errors: string[] }> {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  // 구독자수는 영상이 곧 본인 채널이므로 partners.subscriber_count로 채운다(추가 API 호출 0).
  const { data: partnerRow } = await supabase
    .from('partners').select('subscriber_count').eq('id', partnerId).single()
  const subscriberCount = partnerRow?.subscriber_count ?? null

  let succeeded = 0
  let updated = 0
  const errors: string[] = []

  const isEmptyStr = (v: string | null): boolean => v === null || v.trim() === ''

  for (const p of places) {
    if (!p.name?.trim()) continue
    const name = p.name.trim()
    const videoUrl = p.video_url?.trim() || null
    const videoId = extractVideoIdFromUrl(videoUrl)

    // 재등록 중복 방지: (현재 파트너 + 같은 영상 + 정규화 name 일치) 기존 행을 찾는다.
    // videoId가 없으면(영상 URL 없음/비유튜브) 매칭 자체가 불가 → 신규 insert로 진행.
    // ★name까지 일치해야 매칭 → 같은 영상의 서로 다른 상호(맛집 3곳)는 미매칭되어 각각 insert.
    let existing:
      | { id: string; name: string; address: string | null; category: string | null; latitude: number | null; longitude: number | null; view_count: number | null; subscriber_count: number | null; published_at: string | null }
      | null = null
    if (videoId) {
      const { data: candidates } = await supabase
        .from('places')
        .select('id, name, address, category, latitude, longitude, view_count, subscriber_count, published_at')
        .eq('partner_id', partnerId)
        .ilike('video_url', `%${videoId}%`)
      existing = (candidates ?? []).find(c => normName(c.name) === normName(name)) ?? null
    }

    if (existing) {
      // 기존 행 UPDATE(id 유지 — delete+recreate 금지: video_referrals·verification_logs·
      // place_clicks가 place_id로 참조, place_clicks는 cascade라 지우면 클릭이력 소멸).
      // ★보존(patch에 넣지 않음): verification_status·verified_at(검증이력), status(숨김
      //   되살아남 방지), id·click_count·created_at.
      // (A) 갱신 필드도 "기존 값이 비었을 때만" 채운다(값 있으면 유지 → 수동 보정 보호).
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (isEmptyStr(existing.address) && p.address?.trim()) patch.address = p.address.trim()
      if (isEmptyStr(existing.category) && p.category?.trim()) patch.category = p.category.trim()
      if (existing.latitude === null && p.latitude != null) patch.latitude = p.latitude
      if (existing.longitude === null && p.longitude != null) patch.longitude = p.longitude
      if (existing.view_count === null && p.view_count != null) patch.view_count = p.view_count
      if (existing.subscriber_count === null && subscriberCount != null) patch.subscriber_count = subscriberCount
      if (existing.published_at === null && p.published_at) patch.published_at = p.published_at

      const { error } = await supabase
        .from('places').update(patch).eq('id', existing.id).eq('partner_id', partnerId)
      if (error) errors.push(`${name}: ${error.message}`)
      else updated++
      continue
    }

    const { error } = await supabase.from('places').insert({
      partner_id: partnerId,
      name,
      address: p.address?.trim() || null,
      category: p.category?.trim() || null,
      video_url: videoUrl,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      status: 'active', // 즉시 공개(바로 가입 취지). 사후 가드는 hide(숨김) 기능 유지.
      view_count: p.view_count ?? null,
      subscriber_count: subscriberCount,
      published_at: p.published_at ?? null,
      source: p.source ?? null,  // 추출 출처(coords/timestamp/ai/list). 수동 추가 행은 null.
    })
    if (error) {
      errors.push(`${p.name}: ${error.message}`)
    } else {
      succeeded++
    }
  }

  revalidatePath('/partner/dashboard/places')
  return { succeeded, updated, errors }
}
