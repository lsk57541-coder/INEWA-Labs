import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LocationForm from '@/components/admin/LocationForm'
import Link from 'next/link'

export default async function NewLocationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 장소 목록</Link>
      <h1 className="text-xl font-bold mt-1 mb-6">장소 추가</h1>
      <LocationForm />
    </div>
  )
}
