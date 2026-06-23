'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')

  return supabase
}

export async function approvePlace(id: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('places')
    .update({ status: 'active', rejection_reason: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/places')
}

export async function rejectPlace(id: string, reason: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('places')
    .update({ status: 'rejected', rejection_reason: reason.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/places')
}
