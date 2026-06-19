'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'

export interface MenuUser {
  nickname: string
  avatarUrl: string | null
  isAdmin: boolean
}

interface MenuDrawerProps {
  open: boolean
  onClose: () => void
  user: MenuUser | null
  onShowFavorites: () => void
}

export default function MenuDrawer({ open, onClose, user, onShowFavorites }: MenuDrawerProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh()
    onClose()
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-72 h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
          <span className="font-bold">AI맵튜브</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 border-b">
          {user ? (
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200" />
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate">{user.nickname}님</p>
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  로그아웃
                </button>
              </div>
            </div>
          ) : (
            <KakaoLoginButton />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => { onShowFavorites(); onClose() }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
          >
            ❤️ 관심목록
          </button>

          <Link
            href="/partner/apply"
            onClick={onClose}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
          >
            🎬 유튜버 파트너 신청
          </Link>

          {user?.isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
            >
              ⚙️ 관리자
            </Link>
          )}
        </div>

        <div className="border-t shrink-0 px-4 py-3 flex gap-3 text-xs text-gray-400">
          <Link href="/terms" onClick={onClose} className="hover:text-gray-600">이용약관</Link>
          <Link href="/privacy" onClick={onClose} className="hover:text-gray-600">개인정보처리방침</Link>
        </div>
      </div>
    </div>
  )
}
