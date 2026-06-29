'use client'

import KakaoLoginButton from '@/components/auth/KakaoLoginButton'

interface LoginPromptModalProps {
  open: boolean
  onClose: () => void
  feature?: string // 어떤 기능 때문에 떴는지(예: "찜하기"). 없으면 공통 문구.
}

// 비로그인 시 공용 로그인 유도 모달(찜·가본곳·문의하기 등 공유). 딤 + X, 모바일/PC 모두 중앙 카드.
// 로그인 버튼은 기존 KakaoLoginButton(카카오 OAuth)에 그대로 연결 — 로그인 흐름 자체는 건드리지 않음.
export default function LoginPromptModal({ open, onClose, feature }: LoginPromptModalProps) {
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-end px-3 pt-3">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 pt-1 text-center">
          <p className="text-2xl mb-2">🔑</p>
          <p className="font-bold mb-1">로그인이 필요한 기능이에요</p>
          <p className="text-sm text-gray-500 mb-5">
            {feature
              ? <>로그인하면 <strong className="text-gray-700">{feature}</strong> 기능을 쓸 수 있어요.</>
              : '로그인하면 이 기능을 쓸 수 있어요.'}
          </p>

          <KakaoLoginButton label="카카오로 로그인" className="w-full justify-center" />

          <button
            onClick={onClose}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition mt-3 py-1"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
