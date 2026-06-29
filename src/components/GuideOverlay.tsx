'use client'

import GuideContent from './GuideContent'

interface GuideOverlayProps {
  open: boolean
  onClose: () => void
}

// 사용법 오버레이. FavoritesOverlay와 같은 딤/닫기 톤(absolute inset-0 z-30, 바깥 클릭 닫기).
// 모바일 = 바텀시트(아래서 올라옴, rounded-t-2xl, 내부 스크롤) / 데스크톱(md+) = 중앙 모달.
export default function GuideOverlay({ open, onClose }: GuideOverlayProps) {
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40 md:items-center md:justify-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full bg-white rounded-t-2xl max-h-[85dvh] flex flex-col shadow-2xl md:max-w-lg md:rounded-2xl md:max-h-[80dvh]">
        {/* 모바일 드래그 핸들 바 */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-gray-200 shrink-0">
          <span className="font-bold">사용법</span>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition"
          >
            ✕
          </button>
        </div>

        {/* 본문 — 길어도 내부에서 자연 스크롤 */}
        <div className="overflow-y-auto px-5 py-5">
          <GuideContent />
        </div>
      </div>
    </div>
  )
}
