import { createClient } from '@/lib/supabase/server'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'
import SearchMap from '@/components/SearchMap'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileData } = user
    ? await supabase.from('profiles').select('role, nickname').eq('id', user.id).single()
    : { data: null }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 h-14 border-b bg-white shrink-0">
        <span className="font-bold text-lg">AI맵튜브</span>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {profileData?.role === 'admin' && (
                <Link
                  href="/admin"
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition"
                >
                  관리자
                </Link>
              )}
              <span className="text-sm text-gray-600">{profileData?.nickname ?? '로그인됨'}</span>
            </>
          ) : (
            <KakaoLoginButton />
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <SearchMap />
      </main>
    </div>
  )
}
