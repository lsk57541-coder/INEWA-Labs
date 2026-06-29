'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  const { error } = await supabase.from('places').update(update).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

export async function hidePlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  const { error } = await supabase.from('places').update({ status: 'hidden' }).eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

// 파트너 장소 검증 — 본인 장소만(.eq('partner_id') 명시 + RLS "partner manages own places" 이중).
// confirm: 맞다고 확인(공개 유지). reject: 잘못된 추출 → 검색/지도에서 숨김(status='hidden').
export async function confirmPlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  const { error } = await supabase
    .from('places')
    .update({ verification_status: 'confirmed', verified_at: new Date().toISOString() })
    .eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
  revalidatePath('/partner/dashboard/places')
}

export async function rejectPlace(id: string) {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  // 거부 = 잘못된 장소 → 검증상태 rejected + status='hidden'으로 검색/지도에서 즉시 제외.
  const { error } = await supabase
    .from('places')
    .update({ verification_status: 'rejected', verified_at: new Date().toISOString(), status: 'hidden' })
    .eq('id', id).eq('partner_id', partnerId)
  if (error) throw new Error(error.message)
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

export async function bulkRequestPlaces(places: BulkPlaceInput[]): Promise<{ succeeded: number; errors: string[] }> {
  const supabase = await createClient()
  const partnerId = await requireMyPartnerId()

  // 구독자수는 영상이 곧 본인 채널이므로 partners.subscriber_count로 채운다(추가 API 호출 0).
  const { data: partnerRow } = await supabase
    .from('partners').select('subscriber_count').eq('id', partnerId).single()
  const subscriberCount = partnerRow?.subscriber_count ?? null

  let succeeded = 0
  const errors: string[] = []

  for (const p of places) {
    if (!p.name?.trim()) continue
    const { error } = await supabase.from('places').insert({
      partner_id: partnerId,
      name: p.name.trim(),
      address: p.address?.trim() || null,
      category: p.category?.trim() || null,
      video_url: p.video_url?.trim() || null,
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
  return { succeeded, errors }
}
