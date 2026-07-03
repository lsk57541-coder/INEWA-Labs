'use client'

import type { VideoResult } from '@/app/api/search/route'

// address에서 행정구역(구/군 + 동/읍/면) 토큰만 뽑아 동명 장소 구분용 지역 힌트를 만든다.
// 예) "광주광역시 남구 양림동 123-4" → "남구 양림동". 도로명 주소면 "남구"까지만 잡힐 수 있음.
function extractRegion(address?: string): string {
  if (!address) return ''
  return address
    .split(/\s+/)
    .filter((t) => /(구|군|동|읍|면)$/.test(t))
    .slice(0, 2)
    .join(' ')
}

// 웜 미니멀(Airbnb 감성) 팔레트 — 이 카드 전용. (앱 기본 액센트 blue-600과 별개, 쇼윈도 surface.)
const C = {
  coral: '#D85A30',
  coralBg: '#FAECE7',
  coralText: '#993C1D',
  green: '#1D9E75',
  name: '#2a2320',
  body: '#6b5d54',
  subBg: '#faf7f5',
  subBorder: '#ede4de',
  subText: '#8a7a70',
}

// 소비자 장소 상세 카드(모바일 우선 바텀시트). 파트너 차별점(PARTNER 배지·확인 배지·채널정보)을
// 소비자에게 가시화하는 "모집 쇼윈도". 순수 프레젠테이셔널 — 찜/가본곳/공유/재생은 부모(SearchMap)의
// 기존 핸들러를 props로 주입받아 재사용한다(재생 로직 PlayerFrame·placeKey 무변경).
interface PlaceDetailCardProps {
  video: VideoResult
  isPartner: boolean            // 부모의 isPartnerVideo(v) 결과(실제/데모 파트너 포함)
  favorited: boolean
  visited: boolean
  onPlay: () => void            // = 부모 setSelectedVideo(video) (기존 재생 진입)
  onToggleFavorite: () => void  // = 부모 handleToggleFavorite(video)
  onToggleVisited: () => void   // = 부모 handleToggleVisitedVideo(video)
  onShare: () => void           // = 부모 handleShare(video)
  onClose: () => void
}

export default function PlaceDetailCard({
  video, isPartner, favorited, visited, onPlay, onToggleFavorite, onToggleVisited, onShare, onClose,
}: PlaceDetailCardProps) {
  const name = video.placeName ?? video.title
  // 카카오맵 장소 검색 링크 — 순수 URL 조립(SDK/REST 미사용 = 무비용). 상호명 + 지역(구/동)으로 동명 구분.
  const region = extractRegion(video.address)
  const kakaoQuery = region ? `${name} ${region}` : name
  const kakaoMapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(kakaoQuery)}`
  const isConfirmed = video.verificationStatus === 'confirmed'

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center md:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative w-full max-w-lg bg-white rounded-t-[20px] md:rounded-[20px] shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 썸네일 (~172px) + 하단 그라데이션 */}
        <div className="relative shrink-0" style={{ height: 172 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.thumbnail} alt="" className="w-full h-full object-cover bg-gray-100" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0) 45%)' }} />

          {/* 좌상단 PARTNER 배지 (파트너만) */}
          {isPartner && (
            <span
              className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white pl-1.5 pr-2.5 py-1 shadow-sm"
              style={{ color: C.coral }}
            >
              <CheckIcon size={13} color={C.coral} />
              <span className="text-[11px] font-extrabold tracking-wide">PARTNER</span>
            </span>
          )}

          {/* 우상단: 재생 버튼 + 닫기 */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              onClick={onPlay}
              aria-label="영상 재생"
              className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-95 transition"
            >
              <PlayIcon size={16} color={C.coral} />
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="w-9 h-9 rounded-full bg-white/85 shadow-sm flex items-center justify-center text-[15px] leading-none"
              style={{ color: C.subText }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {/* 2. 상호명 + 카테고리 태그 */}
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[19px] font-bold leading-snug min-w-0" style={{ color: C.name }}>{name}</h2>
            {video.category && (
              <span
                className="shrink-0 mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: C.coralBg, color: C.coralText }}
              >
                {video.category.split(' > ').at(-1)}
              </span>
            )}
          </div>

          {/* 3. 파트너 확인 배지 (confirmed일 때만 — 아니면 렌더 안 함) */}
          {isConfirmed && (
            <div className="flex items-center gap-1 mt-1.5" style={{ color: C.green }}>
              <CheckIcon size={14} color={C.green} />
              <span className="text-[12px] font-semibold">파트너가 확인한 장소</span>
            </div>
          )}

          {/* 4. 정보 3줄 */}
          <div className="mt-3 space-y-2" style={{ color: C.body }}>
            {video.channel && (
              <div className="flex items-center gap-2 text-sm">
                <YoutubeIcon size={16} color={C.coral} />
                <span className="truncate">{video.channel}</span>
              </div>
            )}
            {video.address && (
              <div className="flex items-center gap-2 text-sm">
                <PinIcon size={16} color={C.subText} />
                <span className="leading-snug">{video.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <NavIcon size={16} color={C.subText} />
              <span>현재 위치에서 {video.distanceKm}km</span>
            </div>
          </div>

          {/* 5. 메인 버튼 2개 */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onPlay}
              className="h-12 rounded-[12px] text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.99] transition"
              style={{ backgroundColor: C.coral, flex: 1.7 }}
            >
              <PlayIcon size={16} color="#fff" />
              영상 보기
            </button>
            <a
              href={kakaoMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-12 rounded-[12px] text-sm font-bold flex items-center justify-center transition"
              style={{ backgroundColor: C.coralBg, color: C.coral }}
            >
              카카오맵
            </a>
          </div>

          {/* 6. 보조 버튼 3개(균등): 찜 / 가본 곳 / 공유 */}
          <div className="mt-2 flex items-center gap-2">
            <SubButton label="찜" active={favorited} onClick={onToggleFavorite}>
              <HeartIcon size={18} filled={favorited} color={favorited ? C.coral : C.subText} />
            </SubButton>
            <SubButton label="가본 곳" active={visited} onClick={onToggleVisited}>
              <CheckCircleIcon size={18} active={visited} color={visited ? C.green : C.subText} />
            </SubButton>
            <SubButton label="공유" active={false} onClick={onShare}>
              <ShareIcon size={17} color={C.subText} />
            </SubButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// 보조 버튼 공통 — 연회색 배경 + 테두리. active면 텍스트/아이콘 색이 아이콘 자체에서 강조됨.
function SubButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 h-11 rounded-[12px] border flex items-center justify-center gap-1.5 text-[13px] font-semibold active:scale-[0.98] transition"
      style={{ backgroundColor: C.subBg, borderColor: C.subBorder, color: active ? C.name : C.subText }}
    >
      {children}
      {label}
    </button>
  )
}

/* ── 인라인 아이콘 (이모지 미사용) ── */
function PlayIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M8 5v14l11-7z" /></svg>
}
function CheckIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function YoutubeIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M23 12s0-3.8-.48-5.6a2.92 2.92 0 0 0-2.06-2.06C18.66 3.86 12 3.86 12 3.86s-6.66 0-8.46.48A2.92 2.92 0 0 0 1.48 6.4C1 8.2 1 12 1 12s0 3.8.48 5.6a2.92 2.92 0 0 0 2.06 2.06c1.8.48 8.46.48 8.46.48s6.66 0 8.46-.48a2.92 2.92 0 0 0 2.06-2.06C23 15.8 23 12 23 12zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" /></svg>
}
function PinIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
}
function NavIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
}
function HeartIcon({ size, filled, color }: { size: number; filled: boolean; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
}
function CheckCircleIcon({ size, active, color }: { size: number; active: boolean; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" stroke={active ? '#fff' : color} />
    </svg>
  )
}
function ShareIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>
}
