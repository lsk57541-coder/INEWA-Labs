import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTemplates, updateTemplate } from '../actions'
import OutreachTemplateEditor from '@/components/admin/OutreachTemplateEditor'

export default async function AdminOutreachTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const templates = await getTemplates()

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/admin/outreach" className="text-xs text-gray-400 hover:text-gray-600">← 아웃리치 목록</Link>
      <h1 className="text-xl font-bold mt-1 mb-6">아웃리치 템플릿 관리</h1>

      <div className="space-y-6">
        {templates.map((t) => (
          <OutreachTemplateEditor
            key={t.name}
            name={t.name}
            initialSubject={t.subject}
            initialBody={t.body}
            updateAction={updateTemplate.bind(null, t.name)}
          />
        ))}
      </div>
    </div>
  )
}
