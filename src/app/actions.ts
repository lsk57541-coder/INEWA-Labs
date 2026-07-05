'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { searchPlaceInfo, reverseGeocode, type PlaceDetails } from '@/lib/geocode'
import { PLACENAME_SOURCES, type MinConfidenceSource } from '@/lib/placeNameSources'
import { sendInquiryNotificationEmail } from '@/lib/email'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return supabase
}

const DEFAULT_MIN_CONFIDENCE: MinConfidenceSource = 'address_match'

// Public read — called from the search API for every request, no auth
// required since it's just the display threshold, not sensitive data.
export async function getMinConfidenceSetting(): Promise<MinConfidenceSource> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'min_placename_confidence')
    .maybeSingle()

  const value = data?.value
  return (PLACENAME_SOURCES as readonly string[]).includes(value ?? '')
    ? (value as MinConfidenceSource)
    : DEFAULT_MIN_CONFIDENCE
}

export async function setMinConfidenceSetting(formData: FormData) {
  const supabase = await requireAdmin()
  const source = formData.get('source') as string
  if (!(PLACENAME_SOURCES as readonly string[]).includes(source)) throw new Error('Invalid source')

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'min_placename_confidence', value: source, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export interface AccuracyStat {
  source: string
  total: number
  reported: number
}

// Measures placeName accuracy by source: total videos resolved via each
// method, and how many of those were reported as "주소가 정확하지 않아요".
// A high reported/total ratio for a given source is the clearest signal of
// where to invest in better matching.
export async function getAccuracyStats(): Promise<AccuracyStat[]> {
  const supabase = await requireAdmin()

  const { data: resolutions } = await supabase.from('placename_resolutions').select('video_id, source')
  const { data: reports } = await supabase
    .from('location_reports')
    .select('video_id')
    .eq('reason', 'wrong_address')

  const reportedIds = new Set((reports ?? []).map((r) => r.video_id))
  const bySource = new Map<string, { total: number; reported: number }>()

  for (const row of resolutions ?? []) {
    const entry = bySource.get(row.source) ?? { total: 0, reported: 0 }
    entry.total += 1
    if (reportedIds.has(row.video_id)) entry.reported += 1
    bySource.set(row.source, entry)
  }

  return [...bySource.entries()]
    .map(([source, { total, reported }]) => ({ source, total, reported }))
    .sort((a, b) => b.total - a.total)
}

export async function addLocation(formData: FormData) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('locations').insert({
    name: formData.get('name') as string,
    address: formData.get('address') as string,
    lat: parseFloat(formData.get('lat') as string),
    lng: parseFloat(formData.get('lng') as string),
    description: (formData.get('description') as string) || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/')
}

export async function deleteLocation(locationId: string) {
  await requireAdmin() // 앱 단 권한 검증 (서비스롤은 RLS 우회하므로 필수)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('서버 설정 오류: 서비스 키가 없습니다.')
  const admin = createServiceClient(url, serviceKey)

  // FK에 ON DELETE CASCADE가 없을 수 있으므로 자식 videos 먼저 삭제
  const { error: videosError } = await admin.from('videos').delete().eq('location_id', locationId)
  if (videosError) throw new Error(videosError.message)

  // .select()로 0행 삭제(존재하지 않는 id 등)를 에러로 표출
  const { data, error } = await admin.from('locations').delete().eq('id', locationId).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('삭제된 장소가 없습니다. (이미 삭제되었거나 ID 불일치)')

  revalidatePath('/admin')
  revalidatePath('/')
}

export async function addVideo(locationId: string, video: {
  youtube_id: string
  title: string
  thumbnail: string
  channel: string
  published_at: string
  view_count?: number
  subscriber_count?: number
}) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('videos').insert({ location_id: locationId, ...video })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/locations/${locationId}`)
  revalidatePath('/')
}

export async function deleteVideo(videoId: string, locationId: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('videos').delete().eq('id', videoId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/locations/${locationId}`)
  revalidatePath('/')
}

export async function bulkAddLocations(
  video: { youtube_id: string; title: string; thumbnail: string; channel: string; published_at: string; view_count?: number; subscriber_count?: number },
  places: { name: string; address: string; category?: string; lat: number; lng: number; timestamp_sec?: number; phone?: string; kakao_place_id?: string; category_group_code?: string }[],
  opts?: { replace?: boolean }
): Promise<{ succeeded: number; errors: string[]; duplicate?: { existingPlaces: number } }> {
  const supabase = await requireAdmin()

  // 서비스롤 — videoId 중복 검사 + 교체 삭제용 (locations RLS DELETE 정책 부재 대비).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('서버 설정 오류: 서비스 키가 없습니다.')
  const admin = createServiceClient(url, serviceKey)

  // 같은 videoId가 이미 등록됐는지 (앱 레벨 — youtube_id는 모음영상에서 정상적으로 복수 행이라 DB unique 불가).
  const { data: existing } = await admin
    .from('videos')
    .select('location_id')
    .eq('youtube_id', video.youtube_id)
  const oldLocationIds = [...new Set((existing ?? []).map((v) => v.location_id).filter(Boolean))]

  // 차단(기본): 덮어쓰기 확인 전까지 아무것도 안 건드림.
  if (existing && existing.length > 0 && !opts?.replace) {
    return { succeeded: 0, errors: [], duplicate: { existingPlaces: existing.length } }
  }

  const errors: string[] = []
  let succeeded = 0

  for (const place of places) {
    const { data: loc, error: locErr } = await supabase
      .from('locations')
      .insert({
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        category: place.category ?? null,
        description: place.category ?? null,
        phone: place.phone?.trim() || null,
        kakao_place_id: place.kakao_place_id?.trim() || null,
        category_group_code: place.category_group_code?.trim() || null,
      })
      .select('id')
      .single()

    if (locErr || !loc) {
      errors.push(`"${place.name}" 장소 등록 실패: ${locErr?.message ?? '알 수 없는 오류'}`)
      continue
    }

    const videoRow: Record<string, unknown> = {
      location_id: loc.id,
      youtube_id: video.youtube_id,
      title: video.title,
      thumbnail: video.thumbnail,
      channel: video.channel,
      published_at: video.published_at,
    }
    if (place.timestamp_sec != null) videoRow.timestamp_sec = place.timestamp_sec
    if (video.view_count != null) videoRow.view_count = video.view_count
    if (video.subscriber_count != null) videoRow.subscriber_count = video.subscriber_count

    const { error: vidErr } = await supabase.from('videos').insert(videoRow)

    if (vidErr) {
      errors.push(`"${place.name}" 영상 연결 실패: ${vidErr.message}`)
      continue
    }

    succeeded++
  }

  // 교체(덮어쓰기): 신규 INSERT가 하나라도 성공한 뒤에만 기존 정리(삭제→실패 시 유실 방지).
  // 전부 실패면 기존 데이터 무손상으로 유지.
  if (opts?.replace && oldLocationIds.length > 0 && succeeded > 0) {
    // ⓐ 기존 location들에 붙은 '이 영상'의 video 행만 삭제. (새 video는 새 location_id라 미포함 → 안전)
    await admin.from('videos').delete().in('location_id', oldLocationIds).eq('youtube_id', video.youtube_id)
    // ⓑ 그 중 잔여 video가 0인(고아) location만 삭제. 수동 addVideo로 다른 영상이 붙은 공유 location은 보존.
    const { data: stillUsed } = await admin
      .from('videos')
      .select('location_id')
      .in('location_id', oldLocationIds)
    const usedSet = new Set((stillUsed ?? []).map((v) => v.location_id))
    const orphanIds = oldLocationIds.filter((id) => !usedSet.has(id))
    if (orphanIds.length > 0) {
      await admin.from('locations').delete().in('id', orphanIds)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/')
  return { succeeded, errors }
}

export interface FavoriteVideo {
  video_id: string
  title: string
  thumbnail: string
  channel: string
  lat: number
  lng: number
  place_name?: string
}

export async function toggleFavorite(video: FavoriteVideo): Promise<{ favorited: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  // 같은 영상(video_id)이 여러 장소에 있을 수 있으므로 좌표까지 포함해 식별(장소별 독립 토글).
  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', video.video_id)
    .eq('lat', video.lat)
    .eq('lng', video.lng)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
    return { favorited: false }
  }

  const { error } = await supabase.from('favorites').insert({ user_id: user.id, ...video })
  if (error) throw new Error(error.message)
  return { favorited: true }
}

export async function getFavorites(): Promise<FavoriteVideo[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('favorites')
    .select('video_id, title, thumbnail, channel, lat, lng, place_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

// ===== 문의하기(inquiries) =====
export interface Inquiry {
  id: string
  user_id: string | null
  nickname: string | null
  title: string
  content: string
  created_at: string
  reply: string | null         // 관리자 답장(없으면 null). 처리상태는 이 값의 유무로 판단(미답변/답변완료).
  replied_at: string | null    // 답장 시각
}

const INQUIRY_COLS = 'id, user_id, nickname, title, content, created_at, reply, replied_at'

// 사용자 문의 접수. RLS "insert own inquiry"(auth.uid()=user_id) 통과를 위해 user_id를
// 현재 로그인 사용자로 명시. nickname은 제출 시점 값을 profiles에서 읽어 비정규화 저장.
export async function submitInquiry(input: { title: string; content: string }): Promise<void> {
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title) throw new Error('제목을 입력해주세요.')
  if (!content) throw new Error('내용을 입력해주세요.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: profile } = await supabase
    .from('profiles').select('nickname').eq('id', user.id).single()

  const { error } = await supabase.from('inquiries').insert({
    user_id: user.id,                 // RLS: auth.uid() = user_id 여야 insert 통과
    nickname: profile?.nickname ?? null,
    title,
    content,
    // 처리상태는 더 이상 status 컬럼을 쓰지 않고 reply 유무로 판단(미답변/답변완료).
    // status 컬럼은 DB에 남아있지만(삭제 안 함) 미사용 — insert 시 건드리지 않는다.
  })
  if (error) throw new Error(error.message)

  // 관리자 이메일 알림(베스트에포트) — 실패해도 위 저장/사용자 흐름은 유지(에러 throw 안 함).
  try {
    // 전역 미답변 건수는 service role로 집계(제출자는 RLS상 본인 문의만 보이므로).
    let pendingCount: number | null = null
    const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (sUrl && sKey) {
      const admin = createServiceClient(sUrl, sKey)
      const { count } = await admin
        .from('inquiries').select('id', { count: 'exact', head: true }).is('reply', null)
      pendingCount = count ?? null
    }
    await sendInquiryNotificationEmail({ nickname: profile?.nickname ?? null, title, content, pendingCount })
  } catch (e) {
    console.error('[submitInquiry] notification email failed:', e)
  }
}

// 관리자 — 전체 문의. RLS "admin can read inquiries"로 통과(requireAdmin이 role 확인).
// 정렬: 미답변(reply IS NULL) 먼저, 그 안에서 최신순 → 처리할 문의가 위로 모임.
export async function getInquiries(): Promise<Inquiry[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_COLS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Inquiry[]
  // (reply is null) desc, created_at desc — 미답변을 상단으로.
  rows.sort((a, b) => {
    const aAnswered = a.reply == null ? 0 : 1
    const bAnswered = b.reply == null ? 0 : 1
    if (aAnswered !== bAnswered) return aAnswered - bAnswered
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  return rows
}

// 사용자 — 본인 문의(+답장) 최신순. RLS "select own inquiry"(auth.uid()=user_id)로 본인 것만.
// 명시적 .eq('user_id', user.id)는 RLS와 더해 본인 범위를 코드에서도 분명히 한다(favorites와 동일 관례).
export async function getMyInquiries(): Promise<Inquiry[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('inquiries')
    .select(INQUIRY_COLS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Inquiry[]
}

// 관리자 — 답장 저장(덮어쓰기). reply/replied_at update는 기존 "admin can update inquiries" RLS로 통과.
export async function replyInquiry(id: string, reply: string): Promise<void> {
  const trimmed = reply.trim()
  if (!trimmed) throw new Error('답장 내용을 입력해주세요.')
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('inquiries')
    .update({ reply: trimmed, replied_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/inquiries')
}

export async function toggleVisited(video: FavoriteVideo): Promise<{ visited: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  // 같은 영상(video_id)이 여러 장소에 있을 수 있으므로 좌표까지 포함해 식별(장소별 독립 토글).
  const { data: existing } = await supabase
    .from('visited_places')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', video.video_id)
    .eq('lat', video.lat)
    .eq('lng', video.lng)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('visited_places').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
    return { visited: false }
  }

  const { error } = await supabase.from('visited_places').insert({ user_id: user.id, ...video })
  if (error) throw new Error(error.message)
  return { visited: true }
}

export async function getVisited(): Promise<FavoriteVideo[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('visited_places')
    .select('video_id, title, thumbnail, channel, lat, lng, place_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getPlaceDetails(videoTitle: string | undefined, lat: number, lng: number): Promise<PlaceDetails | null> {
  if (!videoTitle) return null
  const titleMatch = await searchPlaceInfo(videoTitle, lat, lng)
  if (titleMatch?.name) return titleMatch

  const address = await reverseGeocode(lat, lng)
  if (!address) return titleMatch
  const addressMatch = await searchPlaceInfo(address, lat, lng)
  return addressMatch ?? titleMatch
}

export type ReportReason = 'wrong_address' | 'unrelated' | 'inappropriate' | 'other'

// What the user picked from the address/business-name autocomplete (already
// Kakao-verified by /api/geocode, no need to re-geocode here). `address` and
// `name` just say which kind of error they're flagging (for the report log);
// the suggestion's name, address, and coordinates always travel together as
// one real place, since a corrected business name implies its own real
// location too — the marker should move to match it either way.
export interface ReportFix {
  address: boolean
  name: boolean
  suggestion: { name: string; address: string; lat: number; lng: number }
}

export async function cancelReport(videoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { error } = await supabase
    .from('location_reports')
    .delete()
    .eq('user_id', user.id)
    .eq('video_id', videoId)
  if (error) throw new Error(error.message)
}

export async function submitReport(
  videoId: string,
  lat: number,
  lng: number,
  reason: ReportReason,
  fix?: ReportFix
): Promise<{ corrected: boolean; address?: string; placeName?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: existing } = await supabase
    .from('location_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', videoId)
    .maybeSingle()

  const suggestedLabel = fix
    ? [
        fix.address ? `주소: ${fix.suggestion.address}` : null,
        fix.name ? `상호명: ${fix.suggestion.name}` : null,
      ].filter(Boolean).join(' / ') || null
    : null

  // A single admin report is treated as a confirmed takedown (see
  // getBlockedVideoIds in route.ts), so everyone stops seeing the video
  // immediately instead of waiting for the usual 3-report threshold.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const row = {
    video_id: videoId,
    lat,
    lng,
    user_id: user.id,
    reason,
    suggested_address: suggestedLabel,
    is_admin_report: profile?.role === 'admin',
  }

  if (existing) {
    const { error } = await supabase.from('location_reports').update(row).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('location_reports').insert(row)
    if (error) throw new Error(error.message)
  }

  if (reason === 'wrong_address' && fix && (fix.address || fix.name)) {
    const { error } = await supabase.from('location_corrections').upsert(
      {
        video_id: videoId,
        lat: fix.suggestion.lat,
        lng: fix.suggestion.lng,
        address: fix.suggestion.address,
        place_name: fix.suggestion.name,
        created_by: user.id,
      },
      { onConflict: 'video_id' }
    )
    if (error) throw new Error(error.message)
    return { corrected: true, address: fix.suggestion.address, placeName: fix.suggestion.name }
  }

  return { corrected: false }
}

export async function getMyReports(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.from('location_reports').select('video_id').eq('user_id', user.id)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.video_id)
}

export interface PartnerApplication {
  id: string
  channel_id: string
  channel_name: string
  subscriber_count: number | null
  categories: string[] | null
  region: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// Token columns are deliberately excluded — the admin review list never
// needs to display them.
export async function getPartnerApplications(status?: 'pending' | 'approved' | 'rejected'): Promise<PartnerApplication[]> {
  const supabase = await requireAdmin()
  let query = supabase
    .from('partners')
    .select('id, channel_id, channel_name, subscriber_count, categories, region, status, created_at')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}
