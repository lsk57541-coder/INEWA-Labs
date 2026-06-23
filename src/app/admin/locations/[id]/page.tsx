import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { deleteVideo } from '@/app/actions'
import DeleteButton from '@/components/admin/DeleteButton'
import YouTubeSearch from '@/components/admin/YouTubeSearch'
import Link from 'next/link'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: location } = await supabase.from('locations').select('*').eq('id', id).single()
  if (!location) redirect('/admin')

  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('location_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 장소 목록</Link>
      <h1 className="text-xl font-bold mt-1">{location.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{location.address}</p>

      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3">YouTube 영상 추가</h2>
        <YouTubeSearch locationId={id} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">연결된 영상 ({videos?.length ?? 0}개)</h2>
        {!videos || videos.length === 0 ? (
          <p className="text-sm text-gray-400">아직 연결된 영상이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 border rounded-lg p-2">
                <img src={v.thumbnail} alt={decodeHtmlEntities(v.title)} className="w-24 h-14 object-cover rounded shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-medium line-clamp-2">{decodeHtmlEntities(v.title)}</p>
                  <p className="text-xs text-gray-400 truncate">{v.channel}</p>
                </div>
                <DeleteButton
                  action={deleteVideo.bind(null, v.id, id)}
                  confirm="이 영상을 삭제할까요?"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
