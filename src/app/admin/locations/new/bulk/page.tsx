import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BulkLocationForm from '@/components/admin/BulkLocationForm'
import Link from 'next/link'

export default async function BulkNewLocationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 장소 목록</Link>
      <h1 className="text-xl font-bold mt-1 mb-1">영상으로 장소 일괄 등록</h1>
      <p className="text-sm text-gray-500 mb-6">YouTube URL 입력 → 장소 여러 개 입력 → 한 번에 저장</p>
      <BulkLocationForm />
    </div>
  )
}
