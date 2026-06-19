import { createClient } from '@/lib/supabase/server'
import SearchMap from '@/components/SearchMap'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileData } = user
    ? await supabase.from('profiles').select('role, nickname, avatar_url').eq('id', user.id).single()
    : { data: null }

  const { data: partnerData } = user
    ? await supabase.from('partners').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle()
    : { data: null }

  return (
    <div className="flex flex-col h-screen">
      <main className="flex flex-1 overflow-hidden">
        <SearchMap
          user={
            user
              ? {
                  nickname: profileData?.nickname ?? '사용자',
                  avatarUrl: profileData?.avatar_url ?? null,
                  isAdmin: profileData?.role === 'admin',
                  isApprovedPartner: !!partnerData,
                }
              : null
          }
        />
      </main>
    </div>
  )
}
