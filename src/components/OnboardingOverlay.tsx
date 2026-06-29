'use client'

import { useState, useEffect, useCallback, RefObject } from 'react'

const STORAGE_KEY = 'maptube_onboarded'
const PADDING = 10

interface OnboardingOverlayProps {
  searchBarRef: RefObject<HTMLDivElement | null>
  hamburgerRef: RefObject<HTMLButtonElement | null>        // 모바일 플로팅 ☰ (md:hidden)
  hamburgerInlineRef: RefObject<HTMLButtonElement | null>  // 데스크톱 검색패널 내부 인라인 ☰ (hidden md:flex)
  channelTabRef: RefObject<HTMLButtonElement | null>       // "🎙 채널 검색" 탭(검색패널 확장 시 노출)
  onChannelStep?: () => void                               // 채널 Step 진입 시 검색패널 펼침 요청
}

interface SpotlightRect {
  left: number
  top: number
  width: number
  height: number
  bottom: number
  right: number
}

// 모바일/데스크톱에서 같은 역할의 버튼이 둘(하나는 숨김)일 때 실제로 보이는 쪽을 고른다.
// display:none 요소는 getBoundingClientRect가 0,0,0,0 → width/height 0으로 걸러냄.
function firstVisible(...els: (HTMLElement | null)[]): HTMLElement | null {
  for (const el of els) {
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

const STEPS = [
  {
    targetKey: 'search' as const,
    title: '지역이나 키워드로 검색해보세요',
    description: '유튜버가 다녀온 맛집, 카페, 여행지를\n바로 지도에서 찾을 수 있어요',
    examples: ['강남 맛집', '홍대 카페', '제주 숙소'],
    tooltipDir: 'below' as const,
  },
  {
    targetKey: 'channelTab' as const,
    title: '유튜브 채널명으로도 검색돼요',
    description: '채널명으로 검색하면, 그 채널이 소개한 장소가\n전국 지도에 한눈에 떠요 — 네이버·카카오엔 없는 기능!',
    tooltipDir: 'below' as const,
  },
  {
    targetKey: 'none' as const,
    title: '마커를 탭하면 영상을 볼 수 있어요',
    description: '지도 위 핀을 탭하면 그 장소가 나온\n유튜브 영상이 바로 열려요',
    tooltipDir: 'below-marker' as const,
  },
  {
    targetKey: 'hamburger' as const,
    title: '찜·가본곳·사용법은 여기 메뉴에 있어요',
    description: '☰ 메뉴에서 관심목록, 가본 곳,\n사용법을 언제든 다시 볼 수 있어요',
    tooltipDir: 'right' as const,
  },
]

function MapPinIcon() {
  return (
    <svg width="40" height="48" viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M40 4C23.4 4 10 17.4 10 34C10 53.5 40 88 40 88C40 88 70 53.5 70 34C70 17.4 56.6 4 40 4Z"
        fill="#FF5C5C"
      />
      <circle cx="40" cy="34" r="19" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="33" cy="23" rx="7" ry="4.5" fill="rgba(255,255,255,0.18)" />
      <polygon points="34,24 34,44 54,34" fill="white" />
      <ellipse cx="40" cy="91" rx="7" ry="2.5" fill="rgba(255,92,92,0.22)" />
    </svg>
  )
}

export default function OnboardingOverlay({
  searchBarRef,
  hamburgerRef,
  hamburgerInlineRef,
  channelTabRef,
  onChannelStep,
}: OnboardingOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  // 채널 Step에선 검색패널이 펼쳐져 있어야 "🎙 채널 검색" 탭이 보이므로 부모에 펼침 요청.
  // (접혀 있으면 아래 updateRect가 rect=null로 떨어져 중앙 폴백되니 안전엔 문제 없음.)
  useEffect(() => {
    if (visible && STEPS[step]?.targetKey === 'channelTab') onChannelStep?.()
  }, [visible, step, onChannelStep])

  const updateRect = useCallback(() => {
    const key = STEPS[step]?.targetKey
    let el: HTMLElement | null = null
    if (key === 'search') el = searchBarRef.current
    else if (key === 'channelTab') el = channelTabRef.current
    else if (key === 'hamburger') el = firstVisible(hamburgerRef.current, hamburgerInlineRef.current)

    const r = el?.getBoundingClientRect()
    // 타겟이 없거나 보이지 않으면(width/height 0) rect=null → 스포트라이트 없이 중앙 모드 폴백.
    // 데스크톱에서 숨김 햄버거를 가리켜 좌상단(0,0)으로 튀던 결함을 이 가드가 일반적으로 막는다.
    setRect(
      r && r.width > 0 && r.height > 0
        ? { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
        : null
    )
  }, [step, searchBarRef, hamburgerRef, hamburgerInlineRef, channelTabRef])

  useEffect(() => {
    if (!visible) return
    updateRect()
    // 검색패널 펼침(max-h transition 200ms) 등 레이아웃이 안정된 뒤 한 번 더 측정.
    const t1 = setTimeout(updateRect, 60)
    const t2 = setTimeout(updateRect, 260)
    window.addEventListener('resize', updateRect)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', updateRect)
    }
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
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const TOOLTIP_W = 260

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {}
  if (current.tooltipDir === 'below-marker') {
    tooltipStyle = {
      position: 'fixed',
      top: 'calc(36% + 68px)',
      left: '50%',
      transform: 'translateX(-50%)',
    }
  } else if (!rect) {
    // 타겟 없음/비가시 → 중앙 폴백(기존 마커 Step과 동일 처리).
    tooltipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (current.tooltipDir === 'below') {
    const left = Math.max(12, Math.min(rect.left, vw - TOOLTIP_W - 12))
    tooltipStyle = { position: 'fixed', top: rect.bottom + PADDING + 8, left }
  } else if (current.tooltipDir === 'right') {
    const left = rect.right + PADDING + 8
    tooltipStyle = { position: 'fixed', top: rect.top, left: Math.min(left, vw - TOOLTIP_W - 12) }
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

      {/* 마커 Step: 펄스 도는 예시 핀(딤 위). targetKey 'none'/below-marker일 때만. */}
      {current.tooltipDir === 'below-marker' && (
        <div
          className="fixed pointer-events-none z-[61]"
          style={{ top: '36%', left: '50%', transform: 'translate(-50%, -100%)' }}
        >
          <div className="relative flex items-center justify-center">
            {/* Pulse rings */}
            <span
              className="absolute rounded-full bg-red-400 animate-ping opacity-40"
              style={{ width: 44, height: 44, top: 2, left: '50%', transform: 'translateX(-50%)' }}
            />
            <span
              className="absolute rounded-full bg-red-300 animate-ping opacity-20"
              style={{ width: 60, height: 60, top: -6, left: '50%', transform: 'translateX(-50%)', animationDelay: '0.3s' }}
            />
            <MapPinIcon />
          </div>
        </div>
      )}

      {/* Tooltip card */}
      <div
        className="bg-white rounded-2xl shadow-2xl p-4 pointer-events-auto"
        style={{ ...tooltipStyle, width: TOOLTIP_W, position: 'fixed' }}
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
          <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600 transition">
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
