'use client'

import { useState, useEffect, useCallback, RefObject } from 'react'

const STORAGE_KEY = 'maptube_onboarded'
const PADDING = 10

interface OnboardingOverlayProps {
  searchBarRef: RefObject<HTMLDivElement | null>
  hamburgerRef: RefObject<HTMLButtonElement | null>
}

interface SpotlightRect {
  left: number
  top: number
  width: number
  height: number
  bottom: number
  right: number
}

const STEPS = [
  {
    targetKey: 'search' as const,
    title: '키워드나 지역으로 검색해보세요',
    description: '유튜버가 다녀온 맛집, 카페, 여행지를\n바로 지도에서 찾을 수 있어요',
    examples: ['강남 맛집', '홍대 카페', '제주 숙소'],
    tooltipDir: 'below' as const,
  },
  {
    targetKey: 'none' as const,
    title: '마커를 탭하면 영상을 볼 수 있어요',
    description: '지도 위 빨간 핀을 클릭하면\n해당 장소의 유튜브 영상이 바로 열려요',
    tooltipDir: 'center' as const,
  },
  {
    targetKey: 'hamburger' as const,
    title: '관심 장소는 여기서 저장해요',
    description: '☰ 메뉴 → 관심목록에서\n저장한 장소를 언제든 다시 볼 수 있어요',
    tooltipDir: 'right' as const,
  },
]

export default function OnboardingOverlay({ searchBarRef, hamburgerRef }: OnboardingOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  const updateRect = useCallback(() => {
    const key = STEPS[step]?.targetKey
    if (key === 'search') {
      const r = searchBarRef.current?.getBoundingClientRect()
      setRect(r ? { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right } : null)
    } else if (key === 'hamburger') {
      const r = hamburgerRef.current?.getBoundingClientRect()
      setRect(r ? { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right } : null)
    } else {
      setRect(null)
    }
  }, [step, searchBarRef, hamburgerRef])

  useEffect(() => {
    if (!visible) return
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [visible, updateRect])

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      finish()
    }
  }, [step, finish])

  if (!visible) return null

  const current = STEPS[step]
  const totalSteps = STEPS.length

  // Tooltip position
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const TOOLTIP_W = 260

  let tooltipStyle: React.CSSProperties = {}
  if (current.tooltipDir === 'center' || !rect) {
    tooltipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (current.tooltipDir === 'below') {
    const left = Math.max(12, Math.min(rect.left, vw - TOOLTIP_W - 12))
    tooltipStyle = { position: 'fixed', top: rect.bottom + PADDING + 8, left }
  } else if (current.tooltipDir === 'right') {
    const left = rect.right + PADDING + 8
    const top = rect.top
    tooltipStyle = { position: 'fixed', top, left: Math.min(left, vw - TOOLTIP_W - 12) }
  }

  // SVG spotlight dimensions
  const sx = rect ? rect.left - PADDING : 0
  const sy = rect ? rect.top - PADDING : 0
  const sw = rect ? rect.width + PADDING * 2 : 0
  const sh = rect ? rect.height + PADDING * 2 : 0

  return (
    <div className="fixed inset-0 z-[60]" onClick={finish}>
      {/* Dimmed overlay with spotlight hole */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <mask id="ob-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={sx} y={sy} width={sw} height={sh} rx="12" fill="black" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.68)" mask="url(#ob-mask)" />
      </svg>

      {/* Tooltip card */}
      <div
        className="bg-white rounded-2xl shadow-2xl p-4 pointer-events-auto"
        style={{ ...tooltipStyle, width: TOOLTIP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="flex gap-1 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-black' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <p className="text-[10px] text-gray-400 mb-1 font-medium">Step {step + 1}/{totalSteps}</p>
        <h3 className="text-sm font-bold mb-1 leading-snug">{current.title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line mb-3">{current.description}</p>

        {current.examples && (
          <div className="flex flex-wrap gap-1 mb-3">
            {current.examples.map((ex) => (
              <span key={ex} className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{ex}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            건너뛰기
          </button>
          <button
            onClick={next}
            className="text-xs bg-black text-white rounded-lg px-3 py-1.5 hover:bg-gray-800 transition"
          >
            {step < totalSteps - 1 ? '다음 →' : '시작하기 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
