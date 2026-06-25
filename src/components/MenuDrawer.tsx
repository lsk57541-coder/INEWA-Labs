'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'

export interface MenuUser {
  nickname: string
  avatarUrl: string | null
  isAdmin: boolean
  isApprovedPartner: boolean
}

interface MenuDrawerProps {
  open: boolean
  onClose: () => void
  user: MenuUser | null
  onShowFavorites: () => void
  onRestartOnboarding: () => void
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function MenuDrawer({ open, onClose, user, onShowFavorites, onRestartOnboarding }: MenuDrawerProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh()
    onClose()
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex items-start">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-72 max-h-screen overflow-y-auto shadow-2xl flex flex-col" style={{ backgroundColor: '#F8FAFF' }}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ backgroundColor: '#0F1C2E' }}>
          <span className="font-bold text-white">MAPTUBE</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition"
          >
            ✕
          </button>
        </div>

        {/* 서비스 소개 — 헤더와 이어지는 영역 */}
        <div className="px-4 py-3 border-b border-gray-200" style={{ backgroundColor: '#0F1C2E' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>유튜버가 다녀온 그곳, 지도에서 바로 찾아보세요</p>
        </div>

        {/* 유저 섹션 */}
        <div className="px-4 py-4 border-b border-gray-200">
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
                  className="text-xs text-muted hover:text-gray-600 transition"
                >
                  로그아웃
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-3">로그인하면 이런 게 가능해요</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex-shrink-0"><HeartIcon /></span>
                  관심 장소 저장
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex-shrink-0"><FlagIcon /></span>
                  가본 곳 기록
                </div>
              </div>
              <KakaoLoginButton
                label="카카오 1초 로그인"
                className="w-full justify-center mt-3 mb-1"
              />
              <button
                onClick={onClose}
                className="w-full text-center text-xs text-muted hover:text-gray-600 transition mt-2.5 py-1"
              >
                로그인 없이 둘러보기 →
              </button>
            </div>
          )}
        </div>

        {/* 메뉴 항목 */}
        <div>
          {user && (
            <button
              onClick={() => { onShowFavorites(); onClose() }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
            >
              <HeartIcon />
              관심목록
            </button>
          )}

          <button
            onClick={() => { onRestartOnboarding(); onClose() }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
          >
            <CompassIcon />
            앱 소개 다시보기
          </button>

          {user?.isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-gray-50 transition text-left"
            >
              <SettingsIcon />
              관리자
            </Link>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t shrink-0 px-4 py-3 space-y-2">
          {user?.isApprovedPartner ? (
            <Link
              href="/partner/dashboard"
              onClick={onClose}
              className="block text-xs text-muted hover:text-gray-600 transition"
            >
              파트너 대시보드 →
            </Link>
          ) : (
            <Link
              href="/partner/apply"
              onClick={onClose}
              className="block text-xs text-muted hover:text-gray-600 transition"
            >
              유튜버이신가요? 파트너 신청하기 →
            </Link>
          )}
          <div className="flex gap-3 text-xs text-muted">
            <Link href="/terms" onClick={onClose} className="hover:text-gray-600">이용약관</Link>
            <Link href="/privacy" onClick={onClose} className="hover:text-gray-600">개인정보처리방침</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
