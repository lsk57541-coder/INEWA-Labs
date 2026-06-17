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
