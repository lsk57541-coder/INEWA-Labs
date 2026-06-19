'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { searchPlaceInfo, reverseGeocode, type PlaceDetails } from '@/lib/geocode'
import { PLACENAME_SOURCES, type MinConfidenceSource } from '@/lib/placeNameSources'

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
  const supabase = await requireAdmin()
  const { error } = await supabase.from('locations').delete().eq('id', locationId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/')
}

export async function addVideo(locationId: string, video: {
  youtube_id: string
  title: string
  thumbnail: string
  channel: string
  published_at: string
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

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', video.video_id)
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

export async function toggleVisited(video: FavoriteVideo): Promise<{ visited: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: existing } = await supabase
    .from('visited_places')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', video.video_id)
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
