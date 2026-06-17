import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { deleteLocation } from '@/app/actions'
import DeleteButton from '@/components/admin/DeleteButton'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: locations } = await supabase
    .from('locations')
    .select('*, videos(count)')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
          <h1 className="text-xl font-bold mt-1">장소 관리</h1>
        </div>
        <Link
          href="/admin/locations/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition"
        >
          + 장소 추가
        </Link>
      </div>

      {!locations || locations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>등록된 장소가 없습니다</p>
          <p className="text-sm mt-1">장소를 추가해서 영상을 연결해보세요</p>
        </div>
      ) : (
        <ul className="divide-y border rounded-lg overflow-hidden">
          {locations.map((loc) => {
            const videoCount = (loc.videos as { count: number }[])?.[0]?.count ?? 0
            return (
              <li key={loc.id} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50">
                <div>
                  <p className="font-medium text-sm">{loc.name}</p>
                  <p className="text-xs text-gray-400">{loc.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    위도 {loc.lat} · 경도 {loc.lng} · 영상 {videoCount}개
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Link
                    href={`/admin/locations/${loc.id}`}
                    className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded transition"
                  >
                    영상 관리
                  </Link>
                  <DeleteButton
                    action={deleteLocation.bind(null, loc.id)}
                    confirm={`"${loc.name}" 장소를 삭제할까요?`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
