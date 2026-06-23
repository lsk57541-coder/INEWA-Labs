'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sendPartnerApprovedEmail, sendPartnerRejectedEmail } from '@/lib/email'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return supabase
}

// Applicant emails live in auth.users, which an RLS-bound client can't
// read — looking one up requires the service role key.
async function getApplicantEmail(userId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  const admin = createServiceClient(url, serviceKey)
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) return null
  return data.user?.email ?? null
}

export async function approvePartner(id: string, grade: string) {
  if (grade !== 'general' && grade !== 'premium') throw new Error('등급을 선택해주세요.')

  const supabase = await requireAdmin()
  const { data: partner, error: fetchError } = await supabase
    .from('partners')
    .select('user_id, channel_name')
    .eq('id', id)
    .single()
  if (fetchError || !partner) throw new Error(fetchError?.message ?? '신청을 찾을 수 없습니다.')

  const { error } = await supabase.from('partners').update({ status: 'approved', grade }).eq('id', id)
  if (error) throw new Error(error.message)

  if (partner.user_id) {
    const email = await getApplicantEmail(partner.user_id)
    if (email) {
      try {
        await sendPartnerApprovedEmail(email, partner.channel_name, grade)
      } catch {}
    }
  }

  revalidatePath('/admin/partners')
  redirect('/admin/partners')
}

export async function rejectPartner(id: string, reason: string) {
  if (!reason.trim()) throw new Error('거절 사유를 입력해주세요.')

  const supabase = await requireAdmin()
  const { data: partner, error: fetchError } = await supabase
    .from('partners')
    .select('user_id, channel_name')
    .eq('id', id)
    .single()
  if (fetchError || !partner) throw new Error(fetchError?.message ?? '신청을 찾을 수 없습니다.')

  const { error } = await supabase
    .from('partners')
    .update({ status: 'rejected', rejection_reason: reason.trim() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (partner.user_id) {
    const email = await getApplicantEmail(partner.user_id)
    if (email) {
      try {
        await sendPartnerRejectedEmail(email, partner.channel_name, reason.trim())
      } catch {}
    }
  }

  revalidatePath('/admin/partners')
  redirect('/admin/partners')
}

export async function resetPartnerStatus(id: string, status: 'approved' | 'withdrawn' | 'pending') {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('partners').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/partners/${id}`)
  revalidatePath('/admin/partners')
}
