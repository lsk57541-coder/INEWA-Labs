'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendOutreachEmail, sendOutreachFollowUpEmail } from '@/lib/email'
import { substituteTemplate } from '@/lib/outreachTemplate'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return { supabase, userId: user.id }
}

export interface OutreachTarget {
  id: string
  channel_name: string
  youtube_url: string | null
  contact_email: string | null
  category: string | null
  region: string | null
  memo: string | null
  status: 'pending' | 'sent' | 'followed_up' | 'replied' | 'converted' | 'rejected'
  sent_at: string | null
  followed_up_at: string | null
  created_at: string
}

export async function getTargets(): Promise<OutreachTarget[]> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('outreach_targets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export interface OutreachTemplate {
  name: string
  subject: string
  body: string
}

export async function getTemplates(): Promise<OutreachTemplate[]> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('outreach_templates')
    .select('name, subject, body')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateTemplate(name: string, subject: string, body: string) {
  if (!subject.trim() || !body.trim()) throw new Error('제목과 본문을 입력해주세요.')

  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('outreach_templates')
    .update({ subject: subject.trim(), body: body.trim(), updated_at: new Date().toISOString() })
    .eq('name', name)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/outreach/templates')
}

export async function addTarget(formData: FormData) {
  const { supabase } = await requireAdmin()
  const channelName = formData.get('channel_name') as string
  if (!channelName?.trim()) throw new Error('채널명을 입력해주세요.')

  const { error } = await supabase.from('outreach_targets').insert({
    channel_name: channelName.trim(),
    youtube_url: (formData.get('youtube_url') as string)?.trim() || null,
    contact_email: (formData.get('contact_email') as string)?.trim() || null,
    category: (formData.get('category') as string)?.trim() || null,
    region: (formData.get('region') as string)?.trim() || null,
    memo: (formData.get('memo') as string)?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/outreach')
}

export async function updateStatus(targetId: string, status: OutreachTarget['status']) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('outreach_targets').update({ status }).eq('id', targetId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/outreach')
}

export async function sendOutreach(targetId: string, templateName: string) {
  const { supabase, userId } = await requireAdmin()

  const { data: target, error: targetError } = await supabase
    .from('outreach_targets')
    .select('channel_name, contact_email, category, region')
    .eq('id', targetId)
    .single()
  if (targetError || !target) throw new Error(targetError?.message ?? '대상을 찾을 수 없습니다.')
  if (!target.contact_email) throw new Error('연락처 이메일이 없습니다.')

  const { data: template, error: templateError } = await supabase
    .from('outreach_templates')
    .select('subject, body')
    .eq('name', templateName)
    .single()
  if (templateError || !template) throw new Error(templateError?.message ?? '템플릿을 찾을 수 없습니다.')

  const vars = { 채널명: target.channel_name, 카테고리: target.category ?? '', 지역: target.region ?? '' }
  const subject = substituteTemplate(template.subject, vars)
  const body = substituteTemplate(template.body, vars)

  const sent = await sendOutreachEmail(target.contact_email, subject, body)
  if (!sent) throw new Error('이메일 발송에 실패했습니다.')

  const { error: updateError } = await supabase
    .from('outreach_targets')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', targetId)
  if (updateError) throw new Error(updateError.message)

  const { error: logError } = await supabase
    .from('outreach_logs')
    .insert({ target_id: targetId, template_name: templateName, sent_by: userId })
  if (logError) throw new Error(logError.message)

  revalidatePath('/admin/outreach')
}

export async function sendFollowUp(targetId: string) {
  const { supabase, userId } = await requireAdmin()

  const { data: target, error: targetError } = await supabase
    .from('outreach_targets')
    .select('channel_name, contact_email, status')
    .eq('id', targetId)
    .single()
  if (targetError || !target) throw new Error(targetError?.message ?? '대상을 찾을 수 없습니다.')
  if (target.status !== 'sent') throw new Error('이미 발송된 대상에만 팔로업을 보낼 수 있습니다.')
  if (!target.contact_email) throw new Error('연락처 이메일이 없습니다.')

  const sent = await sendOutreachFollowUpEmail(target.contact_email, target.channel_name)
  if (!sent) throw new Error('팔로업 이메일 발송에 실패했습니다.')

  const { error: updateError } = await supabase
    .from('outreach_targets')
    .update({ status: 'followed_up', followed_up_at: new Date().toISOString() })
    .eq('id', targetId)
  if (updateError) throw new Error(updateError.message)

  const { error: logError } = await supabase
    .from('outreach_logs')
    .insert({ target_id: targetId, template_name: null, sent_by: userId })
  if (logError) throw new Error(logError.message)

  revalidatePath('/admin/outreach')
}
