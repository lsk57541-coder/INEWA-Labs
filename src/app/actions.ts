'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return supabase
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

export async function reportWrongLocation(videoId: string, lat?: number, lng?: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('location_reports').insert({
    video_id: videoId,
    lat: lat ?? null,
    lng: lng ?? null,
    user_id: user?.id ?? null,
  })
  if (error) throw new Error(error.message)
}
