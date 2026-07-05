'use client'

import { useState } from 'react'
import type { VideoResult } from '@/app/api/search/route'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

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

// 웜 미니멀(Airbnb 감성) 팔레트 — 소비자 UI 전역 톤. (앱 레거시 액센트 blue-600과 별개.)
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
  danger: '#C0392B',
}

// 재생 화면(상단 플레이어) 하단에 붙는 장소 정보 패널. 순수 프레젠테이셔널 —
// 재생은 부모(SearchMap)가 selectedVideo로 이미 진행 중이고, 여기선 [영상 보기] 없이
// 정보 + 보조 액션만 노출한다. (구 PlaceDetailCard의 정보부를 추출·재사용.)
interface PlaceInfoPanelProps {
  video: VideoResult
  isPartner: boolean            // 부모의 isPartnerVideo(v) 결과(실제/데모 파트너 포함)
  favorited: boolean
  visited: boolean
  reported: boolean
  navUrl: string                // 부모의 navUrl(video, userPos) 결과(길찾기 링크)
  onToggleFavorite: () => void
  onToggleVisited: () => void
  onShare: () => void
  onReport: () => void
  onHide: () => void
}

export default function PlaceInfoPanel({
  video, isPartner, favorited, visited, reported, navUrl,
  onToggleFavorite, onToggleVisited, onShare, onReport, onHide,
}: PlaceInfoPanelProps) {
  const name = video.placeName ?? video.title
  // 카카오맵 딥링크 — 순수 URL 조립(SDK/REST 미사용 = 무비용).
  // ★좌표가 있으면 link/map으로 정확 위치에 핀을 찍어 직행(길찾기 navUrl과 동일 좌표 딥링크 패턴) →
  //   사용자가 카카오에서 다시 고를 필요 없음(재검색 2단계 이탈 제거).
  // 좌표가 없거나 유효하지 않으면(좌표대기 등) 기존 상호명+지역 키워드 검색으로 폴백(깨진 링크 방지).
  const region = extractRegion(video.address)
  const hasCoords =
    Number.isFinite(video.lat) && Number.isFinite(video.lng) && !(video.lat === 0 && video.lng === 0)
  const kakaoMapUrl = hasCoords
    ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${video.lat},${video.lng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(region ? `${name} ${region}` : name)}`
  const isConfirmed = video.verificationStatus === 'confirmed'
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="p-4">
      {/* 1. 상호명 (+ PARTNER 배지) + 카테고리 태그 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
          <h2 className="text-[19px] font-bold leading-snug" style={{ color: C.name }}>{name}</h2>
          {isPartner && (
            <span
              className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5"
              style={{ backgroundColor: C.coralBg, color: C.coral }}
            >
              <CheckIcon size={11} color={C.coral} />
              <span className="text-[10px] font-extrabold tracking-wide">PARTNER</span>
            </span>
          )}
        </div>
        {video.category && (
          <span
            className="shrink-0 mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: C.coralBg, color: C.coralText }}
          >
            {video.category.split(' > ').at(-1)}
          </span>
        )}
      </div>

      {/* 2. 파트너 확인 배지 (confirmed일 때만) */}
      {isConfirmed && (
        <div className="flex items-center gap-1 mt-1.5" style={{ color: C.green }}>
          <CheckIcon size={14} color={C.green} />
          <span className="text-[12px] font-semibold">파트너가 확인한 장소</span>
        </div>
      )}

      {/* 2-1. 재생 중인 영상 제목 — 재생 화면엔 썸네일이 없으므로 제목을 노출(YouTube 정책:
          영상 메타데이터(썸네일·제목)는 시청자에게 보여야 함). 장소명과 동일하면 중복이라 생략. */}
      {video.title && video.title !== name && (
        <p className="mt-2 text-[13.5px] font-medium leading-snug line-clamp-2" style={{ color: C.body }}>
          {decodeHtmlEntities(video.title)}
        </p>
      )}

      {/* 3. 정보 3줄 */}
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

      {/* 4. 주요 액션: 카카오맵 + ··· 더보기(길찾기·신고·숨기기) */}
      <div className="mt-4 flex items-center gap-2">
        <a
          href={kakaoMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-12 rounded-[12px] text-sm font-bold flex items-center justify-center transition active:scale-[0.99]"
          style={{ backgroundColor: C.coralBg, color: C.coral }}
        >
          카카오맵으로 열기
        </a>
        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-label="더보기"
          aria-expanded={moreOpen}
          className="shrink-0 w-12 h-12 rounded-[12px] border flex items-center justify-center active:scale-[0.98] transition"
          style={{ backgroundColor: C.subBg, borderColor: C.subBorder, color: C.subText }}
        >
          <DotsIcon size={20} color={C.subText} />
        </button>
      </div>

      {/* 4-1. 더보기 인라인 메뉴 (overflow-y-auto 안이라 absolute 대신 흐름에 삽입 → 클리핑 방지) */}
      {moreOpen && (
        <div className="mt-2 rounded-[12px] border overflow-hidden" style={{ borderColor: C.subBorder }}>
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium border-b"
            style={{ backgroundColor: C.subBg, borderColor: C.subBorder, color: C.body }}
          >
            <NavIcon size={16} color={C.subText} />
            길찾기
          </a>
          <button
            onClick={() => { onReport(); setMoreOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-left border-b"
            style={{ backgroundColor: C.subBg, borderColor: C.subBorder, color: reported ? C.danger : C.body }}
          >
            <AlertIcon size={16} color={reported ? C.danger : C.subText} />
            잘못된 정보 신고
          </button>
          <button
            onClick={() => { onHide(); setMoreOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-left"
            style={{ backgroundColor: C.subBg, color: C.body }}
          >
            <CloseIcon size={16} color={C.subText} />
            이 장소 숨기기
          </button>
        </div>
      )}

      {/* 5. 보조 버튼 3개(균등): 찜 / 가본 곳 / 공유 */}
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
function DotsIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
}
function AlertIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}
function CloseIcon({ size, color }: { size: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
}
