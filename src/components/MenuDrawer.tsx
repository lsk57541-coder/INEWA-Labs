'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import KakaoLoginButton from '@/components/auth/KakaoLoginButton'
import { PinPlayIcon } from '@/components/BrandLogo'

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
  onShowGuide: () => void
  onShowInquiry: () => void
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

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

export default function MenuDrawer({ open, onClose, user, onShowFavorites, onRestartOnboarding, onShowGuide, onShowInquiry }: MenuDrawerProps) {
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
      <div className="relative w-72 max-h-screen overflow-y-auto shadow-2xl flex flex-col" style={{ backgroundColor: '#FBF8F5' }}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ backgroundColor: '#D85A30' }}>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white shrink-0">
              <PinPlayIcon size={15} />
            </span>
            <span className="font-bold text-white tracking-wide">MAPTUBE</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white transition"
          >
            ✕
          </button>
        </div>

        {/* 서비스 소개 — OG 카드처럼 코랄 짧은 구분선(2px 솔리드 → DPR 무관, 모바일/웹 동일) + 두 줄 슬로건.
            각 줄이 한 덩어리라 "바/로" 같은 단어 중간 끊김 없음. */}
        <div className="px-4 pt-2 pb-3" style={{ backgroundColor: '#FAECE7' }}>
          <div className="mb-2.5" style={{ width: 28, height: 2, backgroundColor: '#D85A30', borderRadius: 1 }} />
          <p className="text-xs font-medium" style={{ color: '#993C1D' }}>영상 속 장소를 지도로</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#8a7a70' }}>유튜버가 다녀온 그곳, 바로 찾아보세요</p>
        </div>

        {/* 유저 섹션 */}
        <div className="px-4 py-4 border-b border-line">
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
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
            >
              <HeartIcon />
              관심목록
            </button>
          )}

          <button
            onClick={() => { onRestartOnboarding(); onClose() }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
          >
            <CompassIcon />
            앱 소개 다시보기
          </button>

          <button
            onClick={() => { onShowGuide(); onClose() }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
          >
            <BookIcon />
            사용법
          </button>

          <button
            onClick={() => { onShowInquiry(); onClose() }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
          >
            <MailIcon />
            문의하기
          </button>

          {/* 파트너 — 모집 진입로(핵심 전략). 푸터 회색 링크에서 정식 메뉴로 승격, 관리자 항목보다 위.
              상태 분기(대시보드/신청)와 라우팅은 기존 로직 그대로 재사용 — 위치·스타일만 변경. */}
          {user?.isApprovedPartner ? (
            <Link
              href="/partner/dashboard"
              onClick={onClose}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
            >
              <StarIcon />
              파트너 대시보드
            </Link>
          ) : (
            <Link
              href="/partner/apply"
              onClick={onClose}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
            >
              <StarIcon />
              유튜버 파트너
            </Link>
          )}

          {user?.isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-surface transition text-left"
            >
              <SettingsIcon />
              관리자
            </Link>
          )}
        </div>

        {/* 푸터 — 법적 링크만(파트너 항목은 위 메뉴 리스트로 승격). */}
        <div className="border-t border-line shrink-0 px-4 py-3">
          <div className="flex gap-3 text-xs text-muted">
            <Link href="/terms" onClick={onClose} className="hover:text-gray-600">이용약관</Link>
            <Link href="/privacy" onClick={onClose} className="hover:text-gray-600">개인정보처리방침</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
