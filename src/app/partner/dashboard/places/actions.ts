'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normName } from '@/lib/normName'

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
// ② 이름 정규화(normName)는 '@/lib/normName' 공용 유틸로 이전.
//    ★매칭키에 name을 넣어 "1영상 다장소(다른 이름)"는 미매칭 → 각각 insert(정상)되게 함.

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

// requireMyPartnerId(그룹B 공유 헬퍼, 무수정)의 throw를 서버 내부에서 키로 변환한다 — Next 프로덕션은
// Server Action throw message를 generic으로 가려 클라이언트가 사유를 못 받으므로, expected error는
// {error:'키'} 반환으로 흘려보낸다(1단계 addPlace가 인라인으로 하던 것을 6개 함수가 공유). 성공 시 id.
// 진짜 예외(예상 못한 것)는 그대로 throw → error.tsx generic.
async function resolvePartnerId(): Promise<{ partnerId: string } | { error: string }> {
  try {
    return { partnerId: await requireMyPartnerId() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('로그인이 필요')) return { error: 'login_expired' }
    if (msg.includes('파트너 정보를 찾을 수 없')) return { error: 'no_partner' }
    throw e
  }
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
  phone?: string               // 카카오 전화(공식 필드)
  kakao_place_id?: string      // 카카오 place id(상세 딥링크 조립·저장용)
  category_group_code?: string // 카카오 대분류(FD6/CE7/AD5 등)
}

// expected error(상호명미입력·로그인만료·파트너없음)는 throw 대신 {error:'키'}로 반환한다 —
// Next 프로덕션은 Server Action throw의 message를 generic으로 가려 클라이언트가 사유를 알 수 없으므로,
// 호출부(PlacesList)가 이 키를 받아 인라인 배너로 안내한다. requireMyPartnerId는 그룹B 공유라 무수정 —
// 그 throw는 서버 내부(경계 넘기 전, message 온전)에서 잡아 키로 변환한다. 진짜 예외(DB error)는 throw 유지.
export async function addPlace(data: PlaceInput): Promise<{ error?: string }> {
  if (!data.name.trim()) return { error: 'no_name' }

  const supabase = await createClient()
  let partnerId: string
  try {
    partnerId = await requireMyPartnerId()
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('로그인이 필요')) return { error: 'login_expired' }
    if (msg.includes('파트너 정보를 찾을 수 없')) return { error: 'no_partner' }
    throw e // 알 수 없는 예외는 그대로 → error.tsx generic
  }

  const { error } = await supabase.from('places').insert({
    partner_id: partnerId,
    name: data.name.trim(),
    address: data.address?.trim() || null,
    category: data.category?.trim() || null,
    video_url: data.video_url?.trim() || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    phone: data.phone?.trim() || null,
    kakao_place_id: data.kakao_place_id?.trim() || null,
    category_group_code: data.category_group_code?.trim() || null,
    status: 'active', // 즉시 공개(바로 가입 취지). 사후 가드는 hide(숨김) 유지.
  })
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
  return {}
}

// RLS (partner manages own places) is the real backstop, but the explicit
// .eq('partner_id', ...) here means a typo'd id just silently affects zero
// rows instead of relying solely on the DB to reject it.
export async function updatePlace(id: string, data: Partial<PlaceInput>): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.address !== undefined) update.address = data.address?.trim() || null
  if (data.category !== undefined) update.category = data.category?.trim() || null
  if (data.video_url !== undefined) update.video_url = data.video_url?.trim() || null
  if (data.latitude !== undefined) update.latitude = data.latitude
  if (data.longitude !== undefined) update.longitude = data.longitude
  if (data.phone !== undefined) update.phone = data.phone?.trim() || null
  if (data.kakao_place_id !== undefined) update.kakao_place_id = data.kakao_place_id?.trim() || null
  if (data.category_group_code !== undefined) update.category_group_code = data.category_group_code?.trim() || null
  update.updated_at = new Date().toISOString() // 파트너 콘텐츠 수정 시점 기록

  const { error } = await supabase.from('places').update(update).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
  return {}
}

export async function hidePlace(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

  // 복원 목적지 기억: 숨기기 직전 status를 prev_status에 저장(unhidePlace가 되돌릴 때 사용).
  // ★이미 'hidden'인 행 재호출 시 prev_status가 'hidden'으로 오염되는 것 방지 — hidden이 아닐 때만 캡처.
  const { data: place } = await supabase
    .from('places').select('status').eq('id', id).eq('partner_id', partnerId).maybeSingle()

  const patch: Record<string, unknown> = { status: 'hidden', updated_at: new Date().toISOString() }
  if (place && place.status !== 'hidden') patch.prev_status = place.status

  const { error } = await supabase.from('places').update(patch).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
  return {}
}

// 공개로 전환(일반 비공개 복원) — prev_status로 되돌린다(null이면 'active' 폴백). 복원 후 prev_status 비움.
// ★검증-reject로 숨긴 것(verification_status==='rejected')은 confirmPlace("맞아요로 변경")가 담당 →
//   여기선 no-op(두 복원 경로가 겹치지 않게). verification_status는 절대 건드리지 않음(검증 이력 보존).
export async function unhidePlace(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

  const { data: place } = await supabase
    .from('places').select('prev_status, verification_status').eq('id', id).eq('partner_id', partnerId).maybeSingle()
  if (!place) return { error: 'place_not_found' }

  // reject-hidden은 검증 경로 전용 — 방어적으로 no-op(UI가 이미 버튼을 안 띄우지만 이중처리 방지).
  if (place.verification_status === 'rejected') {
    revalidatePath('/partner/dashboard/places')
    return {}
  }

  const target = place.prev_status ?? 'active'  // 옛 hidden 행 등 prev_status 없으면 active 폴백
  const { error } = await supabase
    .from('places')
    .update({ status: target, prev_status: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
  return {}
}

// 소프트 삭제 — status='deleted'로만 표시(행 유지). hidePlace(일시 비공개)와 의미 분리한 신규 함수.
// ★소프트라 verification_status·verified_at·id·click_count·created_at 무수정 → place_id 살아있어
//   verification_logs·video_referrals·place_clicks 귀속 보존(delete/cascade 아님). 복구는 관리자만.
export async function deletePlace(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

  const { error } = await supabase.from('places').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
  return {}
}

// 파트너 장소 검증 — 본인 장소만(.eq('partner_id') 명시 + RLS "partner manages own places" 이중).
// confirm: 맞다고 확인(공개 유지). reject: 잘못된 추출 → 검색/지도에서 숨김(status='hidden').
export async function confirmPlace(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

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
  return {}
}

export async function rejectPlace(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const pid = await resolvePartnerId()
  if ('error' in pid) return pid
  const { partnerId } = pid

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
  return {}
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
  video_title?: string      // 영상 제목(등록 시 videoInfo.title에서. 장소관리 영상별 그룹 헤더용).
  phone?: string               // 카카오 전화(공식 필드)
  kakao_place_id?: string      // 카카오 place id(상세 딥링크 조립·저장용)
  category_group_code?: string // 카카오 대분류(FD6/CE7/AD5 등)
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
      | { id: string; name: string; address: string | null; category: string | null; latitude: number | null; longitude: number | null; view_count: number | null; subscriber_count: number | null; published_at: string | null; video_title: string | null }
      | null = null
    if (videoId) {
      const { data: candidates } = await supabase
        .from('places')
        .select('id, name, address, category, latitude, longitude, view_count, subscriber_count, published_at, video_title')
        .eq('partner_id', partnerId)
        .ilike('video_url', `%${videoId}%`)
        .neq('status', 'deleted')  // 삭제한 장소는 매칭 제외 → 재등록 시 신규 생성(deleted 되살아남 방지).
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
      if (isEmptyStr(existing.video_title) && p.video_title?.trim()) patch.video_title = p.video_title.trim()

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
      video_title: p.video_title?.trim() || null,  // 영상 제목(영상별 그룹 헤더용). 수동 행은 null.
      phone: p.phone?.trim() || null,                                // 카카오 전화
      kakao_place_id: p.kakao_place_id?.trim() || null,              // 카카오 place id
      category_group_code: p.category_group_code?.trim() || null,    // 카카오 대분류
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
