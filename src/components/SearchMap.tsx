'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import Script from 'next/script'
import type { VideoResult, SubscriberTier } from '@/app/api/search/route'
import type { ChannelSuggestion } from '@/app/api/channel-search/route'
import { haversineKm } from '@/lib/haversine'
import {
  toggleFavorite,
  getFavorites,
  toggleVisited,
  getVisited,
  submitReport,
  cancelReport,
  getMyReports,
  type FavoriteVideo,
  type ReportReason,
  type ReportFix,
} from '@/app/actions'
import MenuDrawer, { type MenuUser } from '@/components/MenuDrawer'
import FavoritesOverlay from '@/components/FavoritesOverlay'
import OnboardingOverlay from '@/components/OnboardingOverlay'
import GuideOverlay from '@/components/GuideOverlay'
import InquiryOverlay from '@/components/InquiryOverlay'
import LoginPromptModal from '@/components/LoginPromptModal'
import SearchResultModal from '@/components/SearchResultModal'
import PlaceInfoPanel from '@/components/PlaceInfoPanel'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'
import { placeKey } from '@/lib/placeKey'
import { track } from '@/lib/track'
import { MAJOR_CATEGORIES, mapToMajorCategory, ETC_KEY } from '@/lib/categoryMapping'
import { MenuIcon, ChevronRight, ChevronDown, SlidersIcon, GridIcon, KeywordIcon, ChannelIcon, CategoryIcon } from '@/components/mapIcons'

// 검색 로딩 중 순차로 보여주는 단계 라벨(가짜 — /api/search는 단일 JSON 응답이라 실제 단계 진행은
// 받을 수 없음). 실제 파이프라인 순서(YT 검색 → geocode/추출 → dedupe/정렬)에 맞춰 체감만 개선.
const LOADING_STAGES = ['영상 찾는 중…', '위치 분석 중…', '결과 정리 중…'] as const

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'wrong_address', label: '주소 또는 상호명이 잘못됐어요' },
  { key: 'unrelated', label: '주소와 상관없는 영상이에요' },
  { key: 'inappropriate', label: '부적절한 내용이에요' },
  { key: 'other', label: '기타' },
]

interface AddressSuggestion {
  name: string
  address: string
  lat: number
  lng: number
}

interface MarkerGroup {
  lat: number
  lng: number
  videos: VideoResult[]
}

const RADIUS_OPTIONS = [1, 3, 5, 10] as const
type Radius = (typeof RADIUS_OPTIONS)[number]

function groupByLocation(videos: VideoResult[], thresholdKm: number): MarkerGroup[] {
  const groups: MarkerGroup[] = []
  for (const v of videos) {
    const g = groups.find((gr) => haversineKm(gr.lat, gr.lng, v.lat, v.lng) < thresholdKm)
    if (g) {
      g.videos.push(v)
    } else {
      groups.push({ lat: v.lat, lng: v.lng, videos: [v] })
    }
  }
  return groups
}

// A fixed real-world clustering radius looks fine at a 1km search (zoomed
// way in) but leaves dense areas full of overlapping pins at 10km (zoomed
// way out), since the same 80m on the ground covers far fewer screen pixels
// once the map is zoomed out. Scale the threshold with the search radius
// (which also drives the map's zoom level via panTo's levelMap) so distinct
// pins stay visually separated at every zoom.
function clusterThresholdKm(radius: Radius): number {
  return Math.max(0.08, radius * 0.04)
}

// Used by handleSearch to grab GPS silently when the user searches without
// ever having set a location — promise-wrapped so the search flow can just
// await it instead of bouncing the user to a separate "set location first"
// error (real map apps default to your current location, they don't block).
function requestCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null)
    )
  })
}

function formatViews(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억회`
  if (n >= 10_000) return `${Math.floor(n / 10_000)}만회`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}천회`
  return `${n}회`
}

// "회" 없는 컴팩트 한글 숫자표기 (필터 슬라이더 라벨용). 1.2만 / 10만 / 100만 …
function formatCountKo(n: number): string {
  if (n >= 100_000_000) return `${n % 100_000_000 === 0 ? n / 100_000_000 : (n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${n % 10_000 === 0 ? n / 10_000 : (n / 10_000).toFixed(1)}만`
  if (n >= 1_000) return `${n / 1_000}천`
  return `${n}`
}

// 슬라이더 스냅 스텝: 선형은 작은 값 도달이 어려워서 단계로 매핑한다.
// 1-2-3-5-7 / decade 로그식 — 0~수백만 범위를 촘촘하게(작은 값 구간일수록 더 정밀).
const VIEW_STEPS = [
  0, 1_000, 2_000, 3_000, 5_000, 7_000,
  10_000, 20_000, 30_000, 50_000, 70_000,
  100_000, 150_000, 200_000, 300_000, 500_000, 700_000,
  1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000,
]
const SUB_STEPS = [
  0, 1_000, 2_000, 3_000, 5_000, 7_000,
  10_000, 20_000, 30_000, 50_000, 70_000,
  100_000, 200_000, 300_000, 500_000, 700_000,
  1_000_000, 2_000_000, 5_000_000, 10_000_000,
]

const DATE_RANGES = [
  { key: 'all', label: '전체' },
  { key: '1y', label: '최근 1년' },
  { key: '3y', label: '최근 3년' },
  { key: '5y', label: '최근 5년' },
] as const
type DateRange = (typeof DATE_RANGES)[number]['key']

// 해당 구간의 하한 타임스탬프(ms). 'all'은 0(필터 없음).
function dateCutoff(range: DateRange): number {
  if (range === 'all') return 0
  const years = range === '1y' ? 1 : range === '3y' ? 3 : 5
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.getTime()
}

// 값 → 스텝 인덱스(패널 열 때 적용값으로 슬라이더 위치 복원). 값보다 작거나 같은 가장 큰 스텝.
function stepIndexForValue(steps: number[], value: number): number {
  let idx = 0
  for (let i = 0; i < steps.length; i++) if (steps[i] <= value) idx = i
  return idx
}

// 거르기 판정(마커·리스트·[적용] 즉시렌더 공유). 롱폼/쇼츠는 항상 적용.
// 조회수/구독자/날짜 3개 필터는, YT 통계가 없는(views=0 && subs=0) 등록장소·제주 데모를
// "데이터 없음 → 항상 통과"로 둔다(1단계 임시정책). 2·3단계 backfill로 데이터 채우면 정상 적용됨.
function passesFilters(
  v: VideoResult,
  f: { videoFilter: 'all' | 'short' | 'long'; minViews: number; minSubs: number; dateMin: number; category: string }
): boolean {
  // 대분류 카테고리 필터 — 데이터(조회수/구독자) 유무와 무관하게 항상 적용(등록장소도 대상).
  // category 없는 결과(추출 geotag/ai)는 mapToMajorCategory에서 '기타' → 특정 칩 선택 시 자연 제외.
  if (f.category !== 'all' && mapToMajorCategory(v.category) !== f.category) return false
  if (f.videoFilter === 'short' && !v.isShort) return false
  if (f.videoFilter === 'long' && v.isShort) return false
  // 데이터 없는 등록장소/데모: 조회수/구독자/날짜 필터 전부 통과(항상 표시).
  if (v.viewCount === 0 && v.subscriberCount === 0) return true
  if (f.minViews > 0 && v.viewCount < f.minViews) return false
  if (f.minSubs > 0 && v.subscriberCount < f.minSubs) return false
  if (f.dateMin > 0 && v.publishedAt && new Date(v.publishedAt).getTime() < f.dateMin) return false
  return true
}

// Parses the server-formatted "m:ss" / "h:mm:ss" duration string back into
// seconds, purely for client-side sorting.
function parseDurationLabel(duration: string): number {
  const parts = duration.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

function navUrl(
  v: VideoResult,
  from: { lat: number; lng: number; label: string } | null
): string {
  const dest = encodeURIComponent(v.placeName ?? '도착지')
  const end = `${dest},${v.lat},${v.lng}`
  if (!from) return `https://map.kakao.com/link/to/${end}`
  return `https://map.kakao.com/link/from/${encodeURIComponent(from.label)},${from.lat},${from.lng}/to/${end}`
}

// Center-marker HTML: red pulsing dot + "내 위치" label
const CENTER_MARKER_CONTENT = `
<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center">
  <div style="position:relative;width:20px;height:20px">
    <div style="position:absolute;inset:0;border-radius:50%;background:#ef4444;opacity:0.35;transform:scale(1.8)"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>
  </div>
  <div style="margin-top:3px;font-size:10px;font-weight:700;color:#fff;background:#ef4444;padding:1px 6px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap">내 위치</div>
</div>`

// 찜/가본곳 마커는 일반·파트너와 같은 로고 핀 모양으로 통일(아래 logo 섹션에서 정의).

// Shared by every "disabled + 처리 중…" button so a server-bound action
// reads as busy at a glance, not just as a greyed-out label.
function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// 영상 실제 비율(aspectRatio = w/h)에 맞춰 플레이어를 적응시킨다.
// - 가로(ratio≥1): width:100% + aspect-ratio → 16:9 영상은 현행 aspect-video와 동일.
// - 세로(ratio<1): 높이를 portraitMaxVh(dvh/vh)로 고정, 너비는 비율로 자동 산출하여
//   검은 부모 안에 가운데 정렬(좌우 여백). flex 부모 안 auto-width 아이템이라
//   height+aspect-ratio로 너비가 결정됨. maxWidth:100%로 초소형 화면 가드(무크롭).
// - aspectRatio 없음(등록장소·구캐시) → 16:9 폴백(현행과 동일 렌더).
// dvh 폴백은 globals.css .player-portrait(vh 기본 + @supports dvh 향상)로 처리.
function PlayerFrame({ video, portraitMaxVh }: { video: VideoResult; portraitMaxVh: number }) {
  const ratio = video.aspectRatio && video.aspectRatio > 0 ? video.aspectRatio : 16 / 9
  const portrait = ratio < 1
  const src = `https://www.youtube.com/embed/${video.videoId}?autoplay=1${video.startSec ? `&start=${video.startSec}` : ''}`
  return (
    <div className="relative w-full bg-black flex justify-center items-center">
      <div
        className={portrait ? 'relative player-portrait' : 'relative w-full'}
        style={
          portrait
            ? ({ '--ph': portraitMaxVh, aspectRatio: ratio, maxWidth: '100%' } as CSSProperties)
            : { aspectRatio: ratio }
        }
      >
        <iframe
          src={src}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  )
}

// Colors approximating YouTube's actual Creator Award play-button plaques.
const TIER_BUTTON_COLORS: Record<SubscriberTier, string> = {
  silver: '#C0C0C0',
  gold: '#FFC400',
  diamond: '#7DD3FC',
  red_diamond: '#DC2626',
}

// Icon-only "navigate there" button — a compass/arrow glyph on a rounded
// yellow tile, evoking Kakao Navi without using its actual logo asset.
function NaviIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className}>
      <title>길찾기</title>
      <rect width="28" height="28" rx="8" fill="#FEE500" />
      <polygon points="14,6 19,21 14,17.5 9,21" fill="#3C1E1E" />
    </svg>
  )
}

// Original icon shapes (not the official trademarked logos) standing in for
// "long-form video" and "Shorts" in the filter tabs. 형태(가로/세로)로만 구분 —
// 비선택 회색, 선택 시 다른 필터 칩과 같은 코랄(선택 배경색과 통일, 신규색 안 만듦).
function LongformIcon({ className = 'w-5 h-5', active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <title>영상</title>
      <rect x="1" y="4" width="22" height="16" rx="4" fill={active ? '#D85A30' : '#9CA3AF'} />
      <polygon points="10,8.5 10,15.5 16,12" fill="#fff" />
    </svg>
  )
}

function ShortsIcon({ className = 'w-5 h-5', active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <title>쇼츠</title>
      <rect x="7" y="2" width="10" height="20" rx="4" fill={active ? '#D85A30' : '#9CA3AF'} />
      <polygon points="10.5,9 10.5,15 15,12" fill="#fff" />
    </svg>
  )
}

function TierButton({ tier }: { tier: SubscriberTier }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="inline-block shrink-0 align-[-2px]">
      <title>{tier} 플레이 버튼</title>
      <rect x="1" y="3" width="22" height="18" rx="2.5" fill={TIER_BUTTON_COLORS[tier]} stroke="#fff" strokeWidth="1" />
      <polygon points="9,7.5 9,16.5 17,12" fill="#fff" />
    </svg>
  )
}

// 마커 크기(일반·파트너 공통, 적용 후 미세조정 가능).
const MARKER_W = 34
const MARKER_H = 39
// 브랜드 로고(PinPlayIcon) 핀 path — 일반·파트너 마커가 공유하는 단일 모양.
const LOGO_PIN_PATH = 'M40 4C23.4 4 10 17.4 10 34C10 53.5 40 88 40 88C40 88 70 53.5 70 34C70 17.4 56.6 4 40 4Z'

// 로고 핀(브랜드) + 내부 글리프로 마커 이미지 생성. fill·innerSvg만 바꿔 일반/찜/가본곳 공유.
function logoPinMarkerImage(fill: string, innerSvg: string): kakao.maps.MarkerImage {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_W}" height="${MARKER_H}" viewBox="0 0 80 92">` +
    `<path d="${LOGO_PIN_PATH}" fill="${fill}"/>` +
    '<circle cx="40" cy="34" r="19" fill="rgba(0,0,0,0.18)"/>' +
    '<ellipse cx="33" cy="23" rx="7" ry="4.5" fill="rgba(255,255,255,0.18)"/>' +
    innerSvg +
    '</svg>'
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(MARKER_W, MARKER_H),
    { offset: new kakao.maps.Point(MARKER_W / 2, MARKER_H) }
  )
}

const PLAY_GLYPH = '<polygon points="34,24 34,44 54,34" fill="#fff"/>'
const HEART_GLYPH = '<text x="40" y="44" font-size="28" text-anchor="middle" fill="#fff">♥</text>'
const CHECK_GLYPH = '<path d="M31 35l6 7 12-15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'

// 일반=빨간 로고핀+재생삼각형 / 찜=금(amber) 로고핀+♥ / 가본곳=회색 로고핀+✓.
// (구독자 그라데이션 색·쇼츠/롱폼 글리프는 의도적으로 제거 — 모양 완전 통일.)
function logoMarkerImage(): kakao.maps.MarkerImage { return logoPinMarkerImage('#FF5C5C', PLAY_GLYPH) }
function favoriteMarkerImage(): kakao.maps.MarkerImage { return logoPinMarkerImage('#f59e0b', HEART_GLYPH) }
function visitedMarkerImage(): kakao.maps.MarkerImage { return logoPinMarkerImage('#64748b', CHECK_GLYPH) }

// 마커 모양 선택: 찜=금 로고핀+♥, 가본곳=회색 로고핀+✓(둘 다 사용자 선택이라 최우선),
// 그 외 일반=빨간 로고핀. (파트너는 renderMarkers에서 CustomOverlay로 별도 처리 — 우선순위 찜>가본곳>파트너>일반.)
function groupMarkerImage(isFavorite: boolean, isVisited: boolean): kakao.maps.MarkerImage {
  if (isFavorite) return favoriteMarkerImage()
  if (isVisited) return visitedMarkerImage()
  return logoMarkerImage()
}

// 영업 시연용 "데모 파트너": 해당 채널의 마커를 금색 링 + 채널 썸네일로 차별화한다.
// (실제 파트너 시스템 연결 전까지 채널명 정확 매칭. 지금은 둘시네아만 데모 파트너로 지정.)
const DEMO_PARTNERS: Record<string, { thumbnail: string }> = {
  '둘시네아 dulcinea': {
    thumbnail: 'https://yt3.ggpht.com/yQYijHEpoRNen6YgrqWbiXWoGi6D-EvMTKfq4Gut7qSg0UUpNjh8eUZ-y19ouuXaM6bG9hzqQw=s176-c-k-c0xffffffff-no-rj-mo',
  },
}
function getDemoPartner(channel: string): { thumbnail: string } | null {
  return DEMO_PARTNERS[channel] ?? null
}

// 파트너 여부: 실제 파트너(서버 isPartner) 또는 데모 파트너(채널명 매칭).
function isPartnerVideo(v: VideoResult): boolean {
  return !!v.isPartner || !!getDemoPartner(v.channel)
}
// 파트너 마커 썸네일: 실제 파트너 아바타 → 데모 썸네일 → null(없으면 클라가 금색 핀으로 폴백).
function partnerThumbOf(v: VideoResult): string | null {
  return v.partnerThumbnail ?? getDemoPartner(v.channel)?.thumbnail ?? null
}

// 리스트/그룹 공통 정렬 — 거리/영상길이 탭이면 그 기준, 기본(조회수) 탭에서만 파트너 우선노출.
// sortedResults(리스트)와 그룹 마커 자동재생 [0]·나머지 리스트가 같은 순서를 쓰도록 단일 출처화.
function sortVideos(videos: VideoResult[], sortBy: 'views' | 'duration' | 'distance'): VideoResult[] {
  return videos.slice().sort((a, b) => {
    if (sortBy === 'distance') return a.distanceKm - b.distanceKm
    if (sortBy === 'duration') return parseDurationLabel(b.duration) - parseDurationLabel(a.duration)
    const ap = isPartnerVideo(a) ? 1 : 0
    const bp = isPartnerVideo(b) ? 1 : 0
    if (ap !== bp) return bp - ap
    return b.viewCount - a.viewCount
  })
}

// 리스트 카드 상단 배지 줄 — PARTNER(파트너 장소) + 카테고리 태그. 둘 다 없으면 줄 자체를 렌더 안 함.
// 검색결과 리스트·마커 그룹 리스트 양쪽 공용. (액션 아이콘/PlaceInfoPanel과 무관.)
function CardBadgeRow({ v }: { v: VideoResult }) {
  const partner = isPartnerVideo(v)
  const category = Array.isArray(v.category) ? v.category[0] : v.category
  if (!partner && !category) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1">
      {partner && (
        <span
          className="inline-block leading-none"
          style={{ background: '#E8B84B', color: '#4A1B0C', borderRadius: 20, fontSize: 11, fontWeight: 500, padding: '2px 8px', letterSpacing: '0.3px' }}
        >
          PARTNER
        </span>
      )}
      {category && (
        <span
          className="inline-block leading-none"
          style={{ background: '#FAECE7', color: '#993C1D', borderRadius: 20, fontSize: 11, fontWeight: 500, padding: '2px 8px' }}
        >
          {category}
        </span>
      )}
    </div>
  )
}

// 데스크톱(md+, 768px↑): 하단 바텀시트를 좌측 고정 사이드 패널로(구글맵식). 모바일(≤767px)은 불변.
const DESKTOP_LEFT_PANEL = 'md:left-3 md:right-auto md:w-[400px] lg:w-[460px] md:bottom-3 md:rounded-2xl md:z-[8]'

function toFavoritePayload(v: VideoResult): FavoriteVideo {
  return {
    video_id: v.videoId,
    title: v.title,
    thumbnail: v.thumbnail,
    channel: v.channel,
    lat: v.lat,
    lng: v.lng,
    place_name: v.placeName,
  }
}

function DurationBadge({ duration, isShort, className }: { duration: string; isShort: boolean; className: string }) {
  return (
    <div className={`absolute flex items-center gap-1 ${className}`}>
      <span
        className={`flex items-center justify-center w-4 h-4 rounded text-[9px] leading-none ${
          isShort ? 'bg-pink-600' : 'bg-blue-600'
        } text-white`}
        title={isShort ? '쇼츠' : '영상'}
      >
        {isShort ? '📱' : '🎬'}
      </span>
      {duration && (
        <span className="bg-black/75 text-white text-[10px] font-medium px-1 py-0.5 rounded leading-none">
          {duration}
        </span>
      )}
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CheckCircleIcon({ checked }: { checked: boolean }) {
  return checked ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" stroke="white" fill="none" strokeWidth="2" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

interface VideoActionRowProps {
  favorited: boolean
  visited: boolean
  reported: boolean
  onToggleFavorite: () => void
  onToggleVisited: () => void
  onShare: () => void
  onReport: () => void
  onHide: () => void
}

function VideoActionRow({
  favorited,
  visited,
  reported,
  onToggleFavorite,
  onToggleVisited,
  onShare,
  onReport,
  onHide,
}: VideoActionRowProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  // 접근성 탭영역: 각 버튼 수직 44px(h-11) 확보. 리스트 카드 액션행은 가용폭이 좁아
  // (overflow-hidden 컬럼) 수평 확대 시 클리핑 → 수평 footprint는 현행 이내(w-[26px]×4≈104px)로
  // 유지하고, -my-2.5 음수마진으로 큰 탭영역을 주되 행 높이 bloat은 최소화. 아이콘/동작/배치 불변.
  return (
    <div className="flex items-center shrink-0 relative">
      <button
        onClick={onToggleFavorite}
        title={favorited ? '찜 취소' : '찜하기'}
        className="flex items-center justify-center w-[26px] h-11 -my-2.5 text-gray-300 hover:text-amber-400 transition-colors duration-150"
      >
        <HeartIcon filled={favorited} />
      </button>
      <button
        onClick={onToggleVisited}
        title={visited ? '방문 취소' : '가봤어요'}
        className="flex items-center justify-center w-[26px] h-11 -my-2.5 text-gray-300 hover:text-green-500 transition-colors duration-150"
      >
        <CheckCircleIcon checked={visited} />
      </button>
      <button
        onClick={onShare}
        title="공유"
        className="flex items-center justify-center w-[26px] h-11 -my-2.5 text-gray-400 hover:text-gray-600 transition-colors duration-150"
      >
        <ShareIcon />
      </button>
      <button
        onClick={() => setMoreOpen((o) => !o)}
        title="더보기"
        className="flex items-center justify-center w-[26px] h-11 -my-2.5 text-gray-300 hover:text-gray-500 transition text-base leading-none"
      >
        ···
      </button>
      {moreOpen && (
        <div className="absolute right-0 bottom-full mb-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[140px]">
          <button
            onClick={() => { onReport(); setMoreOpen(false) }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${reported ? 'text-danger' : 'text-gray-500'}`}
          >
            <span>{reported ? '🚩' : '⚠'}</span>
            잘못된 정보 신고
          </button>
          <button
            onClick={() => { onHide(); setMoreOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-500"
          >
            <span>✕</span>
            이 장소 숨기기
          </button>
        </div>
      )}
    </div>
  )
}

export default function SearchMap({ user }: { user: MenuUser | null }) {
  const [keyword, setKeyword] = useState('')
  const [radius, setRadius] = useState<Radius>(3)
  const [searchMode, setSearchMode] = useState<'keyword' | 'channel'>('keyword')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [searchChip, setSearchChip] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(true)
  const [panelOpacity, setPanelOpacity] = useState(0.95)
  const [addressInput, setAddressInput] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([])
  const addressInputRef = useRef<HTMLInputElement>(null)
  // 위치/채널 검색결과 모달 표시 대상.
  const [picker, setPicker] = useState<'location' | 'channel' | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posLabel, setPosLabel] = useState<string>('위치 미설정')
  // True once the user has set their search point via the address input
  // rather than real GPS — the locate-me button re-centers on this point
  // instead of overwriting it with the device's actual location.
  const [isManualLocation, setIsManualLocation] = useState(false)
  const [allResults, setAllResults] = useState<VideoResult[]>([])
  const [videoFilter, setVideoFilter] = useState<'all' | 'short' | 'long'>('all')
  const [sortBy, setSortBy] = useState<'views' | 'duration' | 'distance'>('views')
  // 대분류 카테고리 필터. 'all' 또는 MAJOR_CATEGORIES의 key 하나(단일 선택).
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  // 지도 위 카테고리 버튼 → 펼침 그리드 패널 표시 여부.
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false)
  // 적용된 필터(거르기): 마커+리스트를 줄인다. 0/all = 미적용. 데이터 없는(0/미상) 등록장소는 항상 통과.
  const [minViews, setMinViews] = useState(0)
  const [minSubs, setMinSubs] = useState(0)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  // 필터 패널 드래프트(편집 중) — [적용] 시 위 적용값으로 커밋, [초기화]는 드래프트를 0/all로.
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [draftViewIdx, setDraftViewIdx] = useState(0)
  const [draftSubIdx, setDraftSubIdx] = useState(0)
  const [draftDateRange, setDraftDateRange] = useState<DateRange>('all')
  const [channelQuery, setChannelQuery] = useState('')
  const [channelSuggestions, setChannelSuggestions] = useState<ChannelSuggestion[]>([])
  const [channelSearching, setChannelSearching] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<ChannelSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<MarkerGroup | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<VideoResult | null>(null)
  // "영상 단위 장소 전체 보기" — 특정 영상의 모든 장소를 반경 무시하고 지도에 표시하는 일시 뷰.
  // null이면 일반 반경 검색 뷰. (/api/video-places 응답, 채널 모드처럼 fitBounds+칩복귀 재사용.)
  const [focusedVideoPlaces, setFocusedVideoPlaces] = useState<VideoResult[] | null>(null)
  const [focusedLoading, setFocusedLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [favoritesOverlayOpen, setFavoritesOverlayOpen] = useState(false)
  const [guideOverlayOpen, setGuideOverlayOpen] = useState(false)
  const [inquiryOverlayOpen, setInquiryOverlayOpen] = useState(false)
  // 비로그인 로그인 유도 모달. null=닫힘, 문자열=떠 있고 어떤 기능 때문인지(예: "찜하기").
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<VideoResult | null>(null)
  const [reportReason, setReportReason] = useState<ReportReason>('wrong_address')
  const [reportFixAddress, setReportFixAddress] = useState(true)
  const [reportFixName, setReportFixName] = useState(false)
  const [reportQuery, setReportQuery] = useState('')
  const [reportSelected, setReportSelected] = useState<AddressSuggestion | null>(null)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportResult, setReportResult] = useState<string | null>(null)
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [addressSearching, setAddressSearching] = useState(false)
  const addressSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetDragStartY = useRef<number | null>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const hamburgerInlineRef = useRef<HTMLButtonElement>(null) // 데스크톱 검색패널 내부 ☰ (온보딩 타겟)
  const channelTabRef = useRef<HTMLButtonElement>(null)      // "🎙 유튜버 검색" 탭 (온보딩 Step2 타겟)
  const [onboardingKey, setOnboardingKey] = useState(0)

  const handleRestartOnboarding = useCallback(() => {
    localStorage.removeItem('maptube_onboarded')
    setOnboardingKey((k) => k + 1)
  }, [])

  // How much of the map's height is currently covered by a bottom sheet, so
  // panTo can keep whatever point it's centering on inside the visible area
  // instead of behind the sheet. Marker clicks and searches pass their own
  // fraction explicitly since they fire just before the sheet's state
  // actually changes.
  const noResults = !loading && lastSearchQuery !== null && allResults.length === 0
  const currentSheetFraction = selectedGroup ? 0.45 : (allResults.length > 0 || noResults) && listOpen ? 0.5 : 0

  const handleSheetDragStart = (clientY: number) => {
    sheetDragStartY.current = clientY
  }
  const handleSheetDragMove = (clientY: number) => {
    if (sheetDragStartY.current === null) return
    const delta = clientY - sheetDragStartY.current
    if (delta < -40 && !listOpen) { setListOpen(true); sheetDragStartY.current = clientY }
    if (delta > 40 && listOpen) { setListOpen(false); sheetDragStartY.current = clientY }
  }
  const handleSheetDragEnd = () => { sheetDragStartY.current = null }

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null)
  const markersRef = useRef<kakao.maps.Marker[]>([])
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([])
  const circleRef = useRef<kakao.maps.Circle | null>(null)
  const centerOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null)
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null)

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.kakao) return
    if (mapInstanceRef.current) { setMapReady(true); return } // 같은 마운트 내 중복 호출 가드
    kakao.maps.load(() => {
      if (mapInstanceRef.current) { setMapReady(true); return }
      mapInstanceRef.current = new kakao.maps.Map(mapRef.current!, {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 7,
      })
      setMapReady(true)
    })
  }, [])

  // 관리자→메인 등 클라이언트 라우팅으로 재진입하면 SDK가 이미 로드돼 있어 <Script onLoad>가
  // 다시 안 불린다 → 지도가 "불러오는 중"에서 멈춤. 마운트 시 한 번 더 초기화 시도한다.
  // (initMap 내부에 !window.kakao 가드가 있어, 최초 방문은 no-op → Script onLoad가 처리.)
  useEffect(() => {
    initMap()
  }, [initMap])

  // Show / update the red center marker whenever position or map readiness changes
  useEffect(() => {
    if (!mapReady || !userPos || !mapInstanceRef.current) return
    if (centerOverlayRef.current) centerOverlayRef.current.setMap(null)
    centerOverlayRef.current = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(userPos.lat, userPos.lng),
      content: CENTER_MARKER_CONTENT,
      yAnchor: 0.25,
      xAnchor: 0.5,
      zIndex: 10,
    })
    centerOverlayRef.current.setMap(mapInstanceRef.current)
  }, [mapReady, userPos])

  // 위치/채널 검색결과는 SearchResultModal(picker)에서 표시 — 드롭다운/외부클릭 효과 불필요.

  // 로딩 중 단계 라벨 전진(가짜 타이머). 마지막 단계에서 멈추고 '완료'는 표시하지 않음.
  // 검색이 빨리 끝나면(캐시) stage 0만 스쳐감 — 정상.
  useEffect(() => {
    if (!loading) { setLoadingStage(0); return }
    setLoadingStage(0)
    const t1 = setTimeout(() => setLoadingStage(1), 700)
    const t2 = setTimeout(() => setLoadingStage(2), 1800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [loading])

  // 지도 준비 후 sessionStorage에서 마지막 검색 상태 복원.
  // 단, 하드 새로고침(F5)이면 복원하지 않고 초기화면으로 — 저장값도 비운다.
  // (관리자→메인 등 SPA 재진입은 reload가 아니므로 기존대로 검색 유지.)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return
    try {
      const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type
      if (navType === 'reload') {
        sessionStorage.removeItem('maptube_search_state')
      } else {
        const raw = sessionStorage.getItem('maptube_search_state')
        if (raw) {
          const s = JSON.parse(raw) as {
            keyword: string
            radius: number
            searchMode: 'keyword' | 'channel'
            userPos: { lat: number; lng: number }
            posLabel: string
          }
          if (s.keyword) setKeyword(s.keyword)
          if (s.radius && RADIUS_OPTIONS.includes(s.radius as Radius)) setRadius(s.radius as Radius)
          if (s.searchMode) setSearchMode(s.searchMode)
          if (s.userPos) {
            setUserPos(s.userPos)
            setPosLabel(s.posLabel)
            mapInstanceRef.current.setCenter(new kakao.maps.LatLng(s.userPos.lat, s.userPos.lng))
          }
          if (s.keyword) setSearchChip(s.keyword)
        }
      }
    } catch {}
    setRestoreDone(true)
  }, [mapReady])

  useEffect(() => {
    async function load() {
      if (!user) {
        setFavoriteIds(new Set())
        setVisitedIds(new Set())
        setReportedIds(new Set())
        return
      }
      const [favs, vis, reports] = await Promise.all([getFavorites(), getVisited(), getMyReports()])
      setFavoriteIds(new Set(favs.map((f) => placeKey(f.video_id, f.lat, f.lng))))
      setVisitedIds(new Set(vis.map((v) => placeKey(v.video_id, v.lat, v.lng))))
      setReportedIds(new Set(reports))
    }
    load().catch(() => {})
  }, [user])

  // embed_play 계측(fire-and-forget): 영상이 실제 임베드 재생될 때 1회.
  // PlayerFrame autoplay는 selectedVideo 하나로 수렴(마커 단일선택·그룹리스트 선택 모두) →
  // 여기 단일 지점에서 일괄 계측. placeId 없는 admin/비파트너 결과는 track()이 자체 무시.
  // 재생을 막지 않음(await 없음). selectedVideo=null(닫힘)은 placeId 없어 자연 스킵.
  useEffect(() => {
    if (selectedVideo?.placeId) track(selectedVideo.placeId, 'embed_play')
  }, [selectedVideo])

  // 그룹 마커가 열려 있는데 재생 중 영상이 없으면(그룹 진입 직후, 또는 재생 중 영상이 숨김/제거됨)
  // 정렬 기준(sortBy) 첫 영상을 자동 선택 → "마커 클릭 즉시 자동재생". 컴포넌트 스코프라 sortBy 최신 보장.
  // (마커 onGroupClick 클로저는 sortBy가 stale이라, 선택을 여기 효과에서 처리.)
  useEffect(() => {
    if (selectedGroup && !selectedVideo) {
      const ordered = sortVideos(selectedGroup.videos, sortBy)
      if (ordered.length > 0) setSelectedVideo(ordered[0])
      else setSelectedGroup(null)
    }
  }, [selectedGroup, selectedVideo, sortBy])

  // sheetFraction is how much of the map's height a bottom sheet currently
  // covers (0–1). Without it, setCenter puts the point at the geometric
  // center of the whole container, which sits behind/just above the sheet
  // instead of in the middle of what's actually visible. We center normally
  // first, then read back its screen position and re-center on the point
  // that far below it, which pushes the original point up into the middle
  // of the visible area.
  const panTo = useCallback(
    (lat: number, lng: number, sheetFraction = 0) => {
      const map = mapInstanceRef.current
      if (!map) return
      const target = new kakao.maps.LatLng(lat, lng)
      map.setCenter(target)
      const levelMap: Record<number, number> = { 1: 4, 3: 6, 5: 7, 10: 8 }
      map.setLevel(levelMap[radius] ?? 7)

      const containerHeight = mapRef.current?.clientHeight
      if (sheetFraction > 0 && containerHeight) {
        const projection = map.getProjection()
        const centerPoint = projection.containerPointFromCoords(target)
        const shifted = new kakao.maps.Point(
          centerPoint.x,
          centerPoint.y + (containerHeight * sheetFraction) / 2
        )
        map.setCenter(projection.coordsFromContainerPoint(shifted))
      }
    },
    [radius]
  )

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 정보를 지원하지 않습니다.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserPos({ lat: latitude, lng: longitude })
        setPosLabel(`현재 위치 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`)
        setIsManualLocation(false)
        setError(null)
        panTo(latitude, longitude, currentSheetFraction)
        setAdvancedOpen(false)
      },
      () => setError('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.')
    )
  }

  // 플로팅 위치 버튼: 지정위치가 있든 없든 항상 실제 GPS로 이동 + 지정 해제
  // (getLocation이 isManualLocation=false로 되돌리고 현재위치로 panTo).
  const handleLocateButtonClick = () => { getLocation() }

  const fetchLocationSuggestions = async (value: string) => {
    setAddressLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}&list=1`)
      const json = await res.json() as { results?: AddressSuggestion[] }
      setLocationSuggestions(json.results ?? [])
    } catch {
      setLocationSuggestions([])
    } finally {
      setAddressLoading(false)
    }
  }

  // 타이핑은 입력만 갱신(자동검색 제거). 실제 검색은 버튼/Enter → 결과 모달.
  const handleAddressInputChange = (value: string) => {
    setAddressInput(value)
  }

  const runLocationSearch = () => {
    const q = addressInput.trim()
    if (!q) { setError('지역명 또는 주소를 입력해주세요.'); return }
    setError(null)
    setPicker('location')
    setLocationSuggestions([])
    fetchLocationSuggestions(q)
  }

  const selectLocationSuggestion = (s: AddressSuggestion) => {
    setUserPos({ lat: s.lat, lng: s.lng })
    setPosLabel(s.name)
    setIsManualLocation(true)
    panTo(s.lat, s.lng, currentSheetFraction)
    setAddressInput('')
    setLocationSuggestions([])
    setAdvancedOpen(false)
  }

  const renderMarkers = useCallback(
    (
      groups: MarkerGroup[],
      center: { lat: number; lng: number },
      favIds: Set<string>,
      visitedIdSet: Set<string>,
      sheetFraction = 0,
      // 채널 모드: 반경 개념이 없으므로 Circle 생략 + 전국 마커가 다 보이게 fitBounds 줌.
      fitAll = false,
      // "영상 단위 장소 전체 보기": 각 마커에 챕터 순번(1,2,3…) 배지를 얹는다.
      numbered = false
    ) => {
      if (!mapInstanceRef.current) return
      lastCenterRef.current = center

      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      overlaysRef.current.forEach((o) => o.setMap(null))
      overlaysRef.current = []
      if (circleRef.current) circleRef.current.setMap(null)

      if (!fitAll) {
        circleRef.current = new kakao.maps.Circle({
          center: new kakao.maps.LatLng(center.lat, center.lng),
          radius: radius * 1000,
          strokeWeight: 2,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.6,
          fillColor: '#3b82f6',
          fillOpacity: 0.05,
        })
        circleRef.current.setMap(mapInstanceRef.current)
      }

      groups.forEach((group, gi) => {
        const pos = new kakao.maps.LatLng(group.lat, group.lng)
        // 챕터 순번 배지(영상 단위 뷰). 마커 머리 위에 코랄 원형 번호.
        if (numbered) {
          const numEl = `<div style="pointer-events:none;background:#D85A30;color:#fff;border-radius:9999px;min-width:18px;height:18px;padding:0 4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:-58px;box-shadow:0 1px 3px rgba(0,0,0,.35)">${gi + 1}</div>`
          const numOverlay = new kakao.maps.CustomOverlay({ position: pos, content: numEl, yAnchor: 0, zIndex: 6 })
          numOverlay.setMap(mapInstanceRef.current!)
          overlaysRef.current.push(numOverlay)
        }
        const isFavorite = group.videos.some((v) => favIds.has(placeKey(v.videoId, v.lat, v.lng)))
        const isVisited = group.videos.some((v) => visitedIdSet.has(placeKey(v.videoId, v.lat, v.lng)))
        // 데모 파트너 채널이 그룹에 있는지. 단 우선순위는 찜>가본곳>파트너>일반 —
        // 찜/가본곳(사용자 선택)이면 파트너여도 금하트/회색깃발이 우선.
        const partnerVideo = group.videos.find((v) => isPartnerVideo(v)) ?? null
        const partner = partnerVideo ? { thumbnail: partnerThumbOf(partnerVideo) } : null

        const onGroupClick = () => {
          // place_click 계측(fire-and-forget): 클릭한 마커/클러스터에 속한 파트너 장소(placeId)별 1회.
          // placeId 없는 admin/비파트너 결과는 track()이 자체 무시. 아래 기존 동작은 그대로 진행.
          for (const pid of new Set(group.videos.map((v) => v.placeId).filter(Boolean) as string[])) {
            track(pid, 'place_click')
          }
          if (group.videos.length === 1) {
            // 단일영상: 썸네일/마커 탭 → 즉시 재생(전체화면 플레이어 + 하단 정보 패널).
            setSelectedGroup(null)
            setSelectedVideo(group.videos[0])
            panTo(group.lat, group.lng, 0)
          } else {
            // 다중영상: 그룹을 연다. selectedVideo=null로 두면 consistency 효과가 정렬 첫 영상을
            // 자동 선택 → 즉시 자동재생(watch 모달 + 카드 + 아래 나머지 리스트).
            setSelectedGroup(group)
            setSelectedVideo(null)
            panTo(group.lat, group.lng, 0)
          }
        }

        if (partner && !isFavorite && !isVisited) {
          // 파트너 마커: 일반과 같은 로고 핀 모양 + 밝은 샛노랑(#FFD700) + 핀 머리에 동그란 채널 썸네일.
          const countBadge = group.videos.length > 1
            ? `<div style="position:absolute;top:-3px;right:-3px;background:#3b82f6;color:#fff;border-radius:10px;padding:0 5px;font-size:10px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,.3)">${group.videos.length}</div>`
            : ''
          const el = document.createElement('div')
          el.style.cssText = `position:relative;width:${MARKER_W}px;height:${MARKER_H}px;cursor:pointer;`
          // 썸네일 있으면 핀 머리에 원형 아바타, 없으면(아바타 NULL/실패) 흰 재생삼각형 → 금색 로고핀으로 폴백(마커 안 깨짐).
          const partnerHead = partner.thumbnail
            ? '<circle cx="40" cy="34" r="22" fill="#fff"/>'
            : PLAY_GLYPH
          const partnerImg = partner.thumbnail
            ? `<img src="${partner.thumbnail}" referrerpolicy="no-referrer" alt="" onerror="this.style.display='none'" style="position:absolute;left:${MARKER_W / 2 - 8}px;top:${MARKER_H * 34 / 92 - 8}px;width:16px;height:16px;border-radius:50%;object-fit:cover;display:block;" />`
            : ''
          el.innerHTML =
            `<svg width="${MARKER_W}" height="${MARKER_H}" viewBox="0 0 80 92" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">` +
            `<path d="${LOGO_PIN_PATH}" fill="#FFD700"/>` +
            partnerHead +
            '</svg>' +
            partnerImg +
            countBadge
          el.addEventListener('click', onGroupClick)
          const overlay = new kakao.maps.CustomOverlay({
            position: pos,
            content: el,
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: 5,
            // kakao SDK는 clickable을 지원하지만 타입 정의에 없어 캐스트로 추가(클릭 이벤트 보장).
            clickable: true,
          } as kakao.maps.CustomOverlayOptions & { clickable: boolean })
          overlay.setMap(mapInstanceRef.current!)
          overlaysRef.current.push(overlay)
          return
        }

        const marker = new kakao.maps.Marker({
          position: pos,
          map: mapInstanceRef.current!,
          image: groupMarkerImage(isFavorite, isVisited),
        })
        kakao.maps.event.addListener(marker, 'click', onGroupClick)
        markersRef.current.push(marker)

        if (group.videos.length > 1) {
          const overlay = new kakao.maps.CustomOverlay({
            position: pos,
            content: `<div style="pointer-events:none;background:#3b82f6;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:bold;margin-top:-52px;margin-left:14px;box-shadow:0 1px 3px rgba(0,0,0,.3)">${group.videos.length}</div>`,
            yAnchor: 0,
            zIndex: 3,
          })
          overlay.setMap(mapInstanceRef.current!)
          overlaysRef.current.push(overlay)
        }
      })

      // 채널 전국 모드: 모든 마커가 보이게 자동 줌(2개 이상일 때). 하단 결과시트가 가리므로
      // 아래쪽 패딩을 화면 절반만큼 크게 줌. 1개 이하면 일반 panTo로 폴백(과도 줌인 방지).
      if (fitAll && groups.length >= 2) {
        const bounds = new kakao.maps.LatLngBounds()
        groups.forEach((g) => bounds.extend(new kakao.maps.LatLng(g.lat, g.lng)))
        const h = mapRef.current?.clientHeight ?? 0
        mapInstanceRef.current.setBounds(bounds, 60, 40, Math.round(h * 0.5), 40)
      } else {
        panTo(center.lat, center.lng, sheetFraction)
      }
    },
    [radius, panTo]
  )

  const handleSearch = async (opts?: { radiusOverride?: number; keywordOverride?: string; channelOverride?: ChannelSuggestion }) => {
    if (loading) return   // 중복 검색 방지 — Enter 연타/중복 트리거 가드(버튼·칩·Enter 모든 진입점 커버)
    const effectiveKeyword = opts?.keywordOverride ?? keyword
    // 모달에서 채널 클릭 시 setSelectedChannel은 비동기라, 검색엔 override를 직접 쓴다.
    const effectiveChannel = opts?.channelOverride ?? selectedChannel
    if (searchMode === 'keyword' && !effectiveKeyword.trim()) { setError('검색어를 입력해주세요.'); return }
    if (searchMode === 'channel' && !effectiveChannel) { setError('유튜버 채널을 선택해주세요.'); return }

    setLoading(true)
    setError(null)
    setLastSearchQuery(null)
    setFocusedVideoPlaces(null) // 새 반경 검색 시작 → 영상 단위 뷰 해제

    // No location set yet — grab GPS automatically instead of bouncing the
    // user out to find a "현재 위치로" button first.
    let pos = userPos
    if (!pos) {
      pos = await requestCurrentPosition()
      if (!pos) {
        setLoading(false)
        setError('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인하거나 검색위치를 직접 입력해주세요.')
        return
      }
      setUserPos(pos)
      setPosLabel(`현재 위치 (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`)
      setIsManualLocation(false)
    }

    setAllResults([])
    setSelectedGroup(null)
    setSelectedVideo(null)

    const effectiveRadius = opts?.radiusOverride ?? radius
    try {
      const params = new URLSearchParams({
        lat: String(pos.lat),
        lng: String(pos.lng),
        radius: String(effectiveRadius),
      })
      if (searchMode === 'keyword') params.set('q', effectiveKeyword)
      else if (effectiveChannel) params.set('channelId', effectiveChannel.channelId)
      const res = await fetch(`/api/search?${params}`)
      const json = await res.json() as { results?: VideoResult[]; error?: string }

      // Rate limit(429) — 하드에러/크래시 대신 안내 배너. 익명엔 로그인 유도.
      if (res.status === 429) {
        setError(user
          ? '검색 요청이 잠시 많아요. 잠시 후 다시 시도해주세요.'
          : '검색 요청이 잠시 많아요. 잠시 후 다시 시도하거나, 로그인하면 더 많이 검색할 수 있어요.')
        return
      }

      if (!res.ok) throw new Error(json.error ?? '검색 실패')

      const videos = json.results ?? []
      setAllResults(videos)
      setVideoFilter('all')
      // 새 검색은 필터 초기화. 마커 렌더는 아래 useEffect가 filteredResults 기준으로 처리한다.
      // (center만 여기서 세팅 — 첫 검색에서 effect가 그릴 수 있도록.)
      setMinViews(0); setMinSubs(0); setDateRange('all')
      lastCenterRef.current = pos

      // Collapse the options panel out of the way and open the results sheet
      // so the list is visible right away — the search bar itself (with the
      // query still showing) stays visible, it just isn't expanded anymore.
      setOptionsOpen(false)
      setAdvancedOpen(false)
      setListOpen(true)
      setSearchChip(searchMode === 'keyword' ? effectiveKeyword.trim() : (effectiveChannel?.title ?? ''))

      // 메인 재진입 시 상태 복원을 위해 검색 설정 저장
      try {
        sessionStorage.setItem('maptube_search_state', JSON.stringify({
          keyword: effectiveKeyword,
          radius: effectiveRadius,
          searchMode,
          userPos: pos,
          posLabel: posLabel || `현재 위치 (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`,
        }))
      } catch {}

      if (videos.length === 0) {
        setLastSearchQuery(searchMode === 'keyword' ? effectiveKeyword.trim() : (effectiveChannel?.title ?? ''))
        setRadius(effectiveRadius as Radius)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFavorite = async (v: VideoResult) => {
    if (!user) { setLoginPrompt('찜하기'); return }
    const key = placeKey(v.videoId, v.lat, v.lng)
    const wasFavorited = favoriteIds.has(key)
    const next = new Set(favoriteIds)
    if (wasFavorited) next.delete(key)
    else next.add(key)
    setFavoriteIds(next)   // 마커 갱신은 useEffect(favoriteIds 의존)가 처리

    try {
      await toggleFavorite(toFavoritePayload(v))
    } catch (e) {
      setFavoriteIds(favoriteIds)
      setError(e instanceof Error ? e.message : '찜하기 실패')
    }
  }

  const handleToggleVisitedVideo = async (v: VideoResult) => {
    if (!user) { setLoginPrompt('가본 곳 저장'); return }
    const key = placeKey(v.videoId, v.lat, v.lng)
    const wasVisited = visitedIds.has(key)
    const next = new Set(visitedIds)
    if (wasVisited) next.delete(key)
    else next.add(key)
    setVisitedIds(next)   // 마커 갱신은 useEffect(visitedIds 의존)가 처리

    try {
      await toggleVisited(toFavoritePayload(v))
    } catch (e) {
      setVisitedIds(visitedIds)
      setError(e instanceof Error ? e.message : '표시 실패')
    }
  }

  const handleToggleFavoriteById = async (v: FavoriteVideo) => {
    const key = placeKey(v.video_id, v.lat, v.lng)
    const wasFavorited = favoriteIds.has(key)
    const next = new Set(favoriteIds)
    if (wasFavorited) next.delete(key)
    else next.add(key)
    setFavoriteIds(next)
    try {
      await toggleFavorite(v)
    } catch (e) {
      setFavoriteIds(favoriteIds)
      setError(e instanceof Error ? e.message : '찜하기 실패')
    }
  }

  const handleToggleVisited = async (v: FavoriteVideo) => {
    const key = placeKey(v.video_id, v.lat, v.lng)
    const wasVisited = visitedIds.has(key)
    const next = new Set(visitedIds)
    if (wasVisited) next.delete(key)
    else next.add(key)
    setVisitedIds(next)
    try {
      await toggleVisited(v)
    } catch (e) {
      setVisitedIds(visitedIds)
      setError(e instanceof Error ? e.message : '표시 실패')
    }
  }

  const handleShare = (v: VideoResult) => {
    if (typeof Kakao === 'undefined') {
      setError('카카오톡 공유를 사용할 수 없습니다.')
      return
    }
    if (!Kakao.isInitialized()) Kakao.init(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY!)
    // kakao_share 계측(fire-and-forget): 파트너 장소면 기록. 아래 공유 동작은 그대로 진행.
    track(v.placeId, 'kakao_share')
    const youtubeUrl = `https://youtu.be/${v.videoId}`
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: v.title,
        description: v.channel,
        imageUrl: v.thumbnail,
        link: { mobileWebUrl: youtubeUrl, webUrl: youtubeUrl },
      },
      buttons: [{ title: '영상 보기', link: { mobileWebUrl: youtubeUrl, webUrl: youtubeUrl } }],
    })
  }

  const handleReportQueryChange = (value: string) => {
    setReportQuery(value)
    setReportSelected(null)
    if (addressSearchTimer.current) clearTimeout(addressSearchTimer.current)
    if (!value.trim()) { setAddressSuggestions([]); return }
    addressSearchTimer.current = setTimeout(async () => {
      setAddressSearching(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(value.trim())}&list=1`)
        const json = await res.json() as { results?: AddressSuggestion[] }
        setAddressSuggestions(json.results ?? [])
      } catch {
        setAddressSuggestions([])
      } finally {
        setAddressSearching(false)
      }
    }, 350)
  }

  // 버튼/Enter로만 채널 검색 → 결과 모달. (타이핑 자동검색 제거: search.list 100유닛 낭비 방지)
  const runChannelSearch = async () => {
    const q = channelQuery.trim()
    if (!q) { setError('유튜버 채널명을 입력해주세요.'); return }
    setPicker('channel')
    setChannelSearching(true)
    setChannelSuggestions([])
    try {
      const res = await fetch(`/api/channel-search?q=${encodeURIComponent(q)}`)
      const json = await res.json() as { results?: ChannelSuggestion[] }
      setChannelSuggestions(json.results ?? [])
    } catch {
      setChannelSuggestions([])
    } finally {
      setChannelSearching(false)
    }
  }

  const handleHideVideo = (v: VideoResult) => {
    setAllResults((prev) => prev.filter((r) => r.videoId !== v.videoId))
    if (selectedVideo?.videoId === v.videoId) setSelectedVideo(null)
    if (selectedGroup) {
      const remaining = selectedGroup.videos.filter((r) => r.videoId !== v.videoId)
      if (remaining.length === 0) setSelectedGroup(null)
      else setSelectedGroup({ ...selectedGroup, videos: remaining })
    }
  }

  const handleReport = async (v: VideoResult) => {
    if (!user) { setLoginPrompt('신고하기'); return }
    if (reportedIds.has(v.videoId)) {
      const next = new Set(reportedIds)
      next.delete(v.videoId)
      setReportedIds(next)
      try {
        await cancelReport(v.videoId)
      } catch (e) {
        setReportedIds(reportedIds)
        setError(e instanceof Error ? e.message : '신고 취소 실패')
      }
      return
    }
    setReportTarget(v)
    setReportReason('wrong_address')
    setReportFixAddress(true)
    setReportFixName(false)
    setReportQuery('')
    setReportSelected(null)
    setReportResult(null)
    setAddressSuggestions([])
  }

  const handleSubmitReport = async () => {
    if (!reportTarget) return
    setReportSubmitting(true)
    setReportResult(null)
    try {
      const fix: ReportFix | undefined = reportSelected
        ? { address: reportFixAddress, name: reportFixName, suggestion: reportSelected }
        : undefined
      const res = await submitReport(reportTarget.videoId, reportTarget.lat, reportTarget.lng, reportReason, fix)
      setReportedIds((prev) => new Set(prev).add(reportTarget.videoId))
      // The reported video is wrong info for this viewer — drop it from what
      // they're currently looking at immediately, in both the list and the
      // marker-group popup. The corrected address (if any) is only saved as
      // a reference for resolving other users' future searches, not shown
      // back to this viewer as if it were a confirmed business name.
      setAllResults((prev) => prev.filter((r) => r.videoId !== reportTarget.videoId))
      setSelectedGroup((prev) =>
        prev ? { ...prev, videos: prev.videos.filter((v) => v.videoId !== reportTarget.videoId) } : prev
      )
      if (reportReason === 'wrong_address') {
        if (res.corrected) {
          const fixedLabel = [res.address, res.placeName].filter(Boolean).join(' / ')
          setReportResult(`반영했습니다: "${fixedLabel}" — 다음 검색부터 정확한 정보로 반영됩니다.`)
        } else {
          setReportResult('신고가 접수되었습니다.')
        }
      } else {
        setReportResult('신고가 접수되었습니다.')
      }
      setTimeout(() => setReportTarget(null), 1200)
    } catch (e) {
      setReportResult(e instanceof Error ? e.message : '신고 처리 실패')
    } finally {
      setReportSubmitting(false)
    }
  }

  const handleShowFavorites = () => {
    if (!user) { setLoginPrompt('관심목록 보기'); return }
    setFavoritesOverlayOpen(true)
  }

  const handleShowGuide = () => setGuideOverlayOpen(true) // 사용법 — 로그인 불필요

  // 문의하기 — 찜·가본곳과 동일한 비로그인 게이팅(공용 로그인 유도 모달).
  const handleShowInquiry = () => {
    if (!user) { setLoginPrompt('문의하기'); return }
    setInquiryOverlayOpen(true)
  }

  // 거르기(필터): 마커+리스트 공통 집합. 정렬 전 단계라 마커 그룹핑에 그대로 쓴다.
  const filteredResults = allResults.filter((v) =>
    passesFilters(v, { videoFilter, minViews, minSubs, dateMin: dateCutoff(dateRange), category: categoryFilter })
  )

  // '기타'(미분류) 안전망 칩 노출 판정: 카테고리 필터만 빼고(category:'all') 나머지 필터 적용 후
  // '기타'로 매핑되는 결과 수 = "기타 칩 누르면 나올 개수". 1건 이상일 때만 칩 렌더(0건이면 숨김).
  const etcResultCount = allResults.filter((v) =>
    passesFilters(v, { videoFilter, minViews, minSubs, dateMin: dateCutoff(dateRange), category: 'all' })
    && mapToMajorCategory(v.category) === ETC_KEY
  ).length

  // 리스트 표시는 정렬 적용본. (마커는 filteredResults를 써서 정렬 변경 시 불필요 재렌더 방지.)
  // 정렬 로직은 sortVideos로 단일화 — 그룹 마커 자동재생/나머지 리스트도 동일 comparator 사용.
  const sortedResults = sortVideos(filteredResults, sortBy)

  // 적용 필터값이 기본이 아니면 활성 — 아이콘 배지/카운트 표시용.
  const filterActive = minViews > 0 || minSubs > 0 || dateRange !== 'all'

  // 패널 열 때 드래프트를 현재 적용값으로 동기화(슬라이더 위치 복원).
  const openFilterPanel = () => {
    setDraftViewIdx(stepIndexForValue(VIEW_STEPS, minViews))
    setDraftSubIdx(stepIndexForValue(SUB_STEPS, minSubs))
    setDraftDateRange(dateRange)
    setFilterPanelOpen(true)
  }

  // [초기화]: 드래프트만 기본으로(아직 적용 안 함 — [적용] 눌러야 반영).
  const resetDraftFilters = () => {
    setDraftViewIdx(0); setDraftSubIdx(0); setDraftDateRange('all')
  }

  // [적용]: 드래프트 → 적용값 커밋 + 패널 닫기. 마커는 아래 useEffect가 갱신(추가 API 호출 없음).
  const applyFilters = () => {
    setMinViews(VIEW_STEPS[draftViewIdx])
    setMinSubs(SUB_STEPS[draftSubIdx])
    setDateRange(draftDateRange)
    setFilterPanelOpen(false)
  }

  // "이 영상 장소 전체 보기" — 반경 무시하고 그 영상의 모든 장소를 별도 엔드포인트로 조회해
  // 포커스 뷰로 전환. 반경 검색 결과(allResults)는 그대로 두고 focusedVideoPlaces만 세팅 →
  // 마커 effect가 fitBounds+번호마커로 다시 그림. userPos는 지역 앵커+거리표시용.
  const handleShowVideoPlaces = async (v: VideoResult) => {
    if (!userPos) return
    setFocusedLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ videoId: v.videoId, lat: String(userPos.lat), lng: String(userPos.lng) })
      const res = await fetch(`/api/video-places?${params}`)
      const data = (await res.json()) as { results?: VideoResult[] }
      const places = data.results ?? []
      if (places.length === 0) { setError('이 영상의 장소를 찾지 못했어요.'); return }
      setSelectedVideo(null)
      setSelectedGroup(null)
      setFocusedVideoPlaces(places)
      setListOpen(true)
    } catch {
      setError('장소를 불러오지 못했어요.')
    } finally {
      setFocusedLoading(false)
    }
  }
  const exitFocusedVideo = () => setFocusedVideoPlaces(null)

  // ── 마커 단일 렌더 소스 ──
  // 검색/조회수·구독자·날짜/롱폼·쇼츠/찜·가본곳/신고삭제 등 무엇이 바뀌든, 마커는 항상
  // filteredResults(= 리스트 sortedResults와 동일 집합)를 반영해 다시 그린다. (흩어진 명령형
  // 호출을 없애 마커-리스트 불일치를 제거.) center 미설정(검색 전)이면 건너뜀.
  useEffect(() => {
    if (!lastCenterRef.current) return
    if (focusedVideoPlaces) {
      // 영상 단위 뷰: 반경 무시 → 채널 모드처럼 fitBounds(전체 보이게) + 챕터 순번 마커.
      // 근접 병합은 최소(0.05km)로만 — 서로 다른 장소가 번호를 각자 갖게.
      renderMarkers(
        groupByLocation(focusedVideoPlaces, 0.05),
        lastCenterRef.current, favoriteIds, visitedIds, currentSheetFraction, true, true
      )
    } else {
      renderMarkers(
        groupByLocation(filteredResults, clusterThresholdKm(radius)),
        lastCenterRef.current, favoriteIds, visitedIds, currentSheetFraction, searchMode === 'channel'
      )
    }
    // filteredResults는 아래 입력들로 파생되므로 그 입력들을 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, videoFilter, minViews, minSubs, dateRange, categoryFilter, favoriteIds, visitedIds, focusedVideoPlaces])

  // Keep the locate-me button clear of whichever bottom sheet is currently
  // showing (results list or a marker group's video list), instead of
  // floating on top of it.
  // 그룹 watch 모달의 "이 위치의 다른 영상" 리스트 행. (구 그룹 바텀시트 행 마크업을 이전·재사용.)
  const renderGroupVideoRow = (v: VideoResult) => (
    <div
      key={`${v.videoId}:${v.lat}:${v.lng}`}
      className="flex gap-3 px-3 py-3.5 transition border-b border-line last:border-0 group hover:bg-surface"
    >
      <div className="relative shrink-0 cursor-pointer" onClick={() => setSelectedVideo(v)}>
        <img src={v.thumbnail} alt="" className="w-[120px] h-[70px] object-cover rounded-lg" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center shadow-sm">
            <div className="w-0 h-0 border-y-[7px] border-y-transparent border-l-[13px] border-l-white ml-1" />
          </div>
        </div>
        <DurationBadge duration={v.duration} isShort={v.isShort} className="bottom-1 right-1" />
      </div>
      <div className="flex-1 overflow-hidden min-w-0">
        <CardBadgeRow v={v} />
        <p
          className="text-xs font-medium line-clamp-2 leading-snug cursor-pointer hover:text-coral"
          onClick={() => setSelectedVideo(v)}
        >
          {decodeHtmlEntities(v.title)}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          {v.placeName && (
            <p className="text-sm font-semibold text-gray-800 truncate">📍 {v.placeName}</p>
          )}
          <span className="shrink-0 text-xs font-bold text-coral bg-coral-soft rounded px-1.5 py-0.5">
            {v.distanceKm}km
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {v.subscriberTier && <TierButton tier={v.subscriberTier} />} {v.channel}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{formatViews(v.viewCount)}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <a
            href={navUrl(v, userPos ? { ...userPos, label: posLabel } : null)}
            target="_blank"
            rel="noopener noreferrer"
            title="길찾기"
          >
            <NaviIcon className="w-7 h-7" />
          </a>
          <VideoActionRow
            favorited={favoriteIds.has(placeKey(v.videoId, v.lat, v.lng))}
            visited={visitedIds.has(placeKey(v.videoId, v.lat, v.lng))}
            reported={reportedIds.has(v.videoId)}
            onToggleFavorite={() => handleToggleFavorite(v)}
            onToggleVisited={() => handleToggleVisitedVideo(v)}
            onShare={() => handleShare(v)}
            onReport={() => handleReport(v)}
            onHide={() => handleHideVideo(v)}
          />
        </div>
      </div>
    </div>
  )

  // 지도 위 카테고리 버튼 라벨(기본 '카테고리' = 용도 표기, 진입점 혼란 방지). 선택 시 "카테고리 · {대분류명}".
  const currentCatLabel = (() => {
    if (categoryFilter === 'all') return '카테고리'
    if (categoryFilter === ETC_KEY) return '카테고리 · 기타'
    const found = MAJOR_CATEGORIES.find((c) => c.key === categoryFilter)
    return found ? `카테고리 · ${found.label}` : '카테고리'
  })()

  const locateButtonBottomClass = (selectedGroup && selectedVideo)
    ? 'bottom-[calc(45dvh+56.25vw+60px)]'
    : selectedGroup
      ? 'bottom-[calc(45dvh+12px)]'
      : allResults.length > 0 || noResults
        ? listOpen ? 'bottom-[calc(50dvh+12px)]' : 'bottom-16'
        : 'bottom-6'

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false&libraries=drawing`}
        strategy="afterInteractive"
        onLoad={initMap}
      />
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        strategy="lazyOnload"
      />

      {/* Map */}
      <div ref={mapRef} className="flex-1 h-full touch-none" />
      {(!mapReady || !restoreDone) && (
        <div className="absolute inset-0 z-[5] pointer-events-none bg-gray-100 flex flex-col items-center justify-center gap-2">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
              <path d="M16 0C7 0 0 7 0 16c0 11 16 26 16 26S32 27 32 16C32 7 25 0 16 0z" fill="#d1d5db"/>
              <circle cx="16" cy="16" r="7" fill="#9ca3af"/>
            </svg>
            <div className="h-2.5 w-28 bg-gray-300 rounded" />
          </div>
          <p className="text-xs text-gray-400 mt-1">지도 불러오는 중...</p>
        </div>
      )}

      {/* Locate-me button — same target+crosshair glyph Google/Kakao/Naver
          maps use, so its purpose reads at a glance. Sits above whichever
          bottom sheet is open instead of overlapping it. */}
      <button
        onClick={handleLocateButtonClick}
        title="현재 위치로 이동"
        className={`absolute ${locateButtonBottomClass} left-3 z-20 md:left-auto md:right-6 md:bottom-6 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-coral hover:bg-gray-50 transition`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>

      {/* Hamburger menu (모바일 플로팅 — 데스크톱은 검색바 안 인라인 햄버거 사용) */}
      <button
        ref={hamburgerRef}
        onClick={() => setMenuOpen(true)}
        className="absolute top-3 left-3 z-20 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-coral hover:bg-gray-50 transition md:hidden"
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      {/* 결과 필터 버튼 (우측 상단) — 결과가 있을 때만. "필터" 텍스트 항상 노출(카테고리 진입점과
          구분). 활성 시 "전체→남은" 개수 표시. */}
      {allResults.length > 0 && (
        <button
          onClick={openFilterPanel}
          title="검색결과 필터"
          aria-label="검색결과 필터"
          className="absolute top-3 right-3 z-20 h-10 px-3 bg-white rounded-full shadow-lg flex items-center gap-1.5 hover:bg-gray-50 transition"
        >
          <SlidersIcon className={`w-5 h-5 ${filterActive ? 'text-coral' : 'text-gray-700'}`} />
          <span className={`text-sm font-semibold whitespace-nowrap ${filterActive ? 'text-coral' : 'text-ink'}`}>필터</span>
          {filterActive && (
            <span className="text-xs font-bold text-coral tabular-nums">{allResults.length}→{filteredResults.length}</span>
          )}
        </button>
      )}

      {/* 카테고리 필터 (지도 우측, 결과 필터 버튼 아래) — 버튼 탭 → 그리드 패널 펼침 */}
      {allResults.length > 0 && (
        <>
          <button
            onClick={() => setCategoryPanelOpen((o) => !o)}
            aria-label="카테고리 필터"
            className={`absolute top-16 right-3 z-20 h-10 px-3 rounded-full shadow-lg flex items-center gap-1.5 text-sm font-semibold transition ${
              categoryFilter !== 'all' ? 'bg-coral text-white' : 'bg-white text-ink hover:bg-gray-50'
            }`}
          >
            <GridIcon className="w-4 h-4" />
            <span className="whitespace-nowrap">{currentCatLabel}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {categoryPanelOpen && (
            <>
              {/* 바깥 탭 → 닫힘(선택 없이) */}
              <div className="absolute inset-0 z-20" onClick={() => setCategoryPanelOpen(false)} />
              <div className="absolute top-[108px] right-3 z-30 w-60 max-w-[calc(100vw-24px)] bg-warm rounded-2xl shadow-2xl border border-line p-3">
                <button
                  onClick={() => { setCategoryFilter('all'); setCategoryPanelOpen(false) }}
                  className={`w-full mb-2 h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold border transition ${
                    categoryFilter === 'all' ? 'bg-coral text-white border-coral' : 'bg-white text-ink border-line hover:bg-surface'
                  }`}
                >
                  <CategoryIcon k="all" className="w-4 h-4" /> 전체
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {MAJOR_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => { setCategoryFilter(c.key); setCategoryPanelOpen(false) }}
                      className={`h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition ${
                        categoryFilter === c.key ? 'bg-coral text-white border-coral' : 'bg-white text-ink border-line hover:bg-surface'
                      }`}
                    >
                      <CategoryIcon k={c.key} className="w-5 h-5" />
                      <span className="text-xs font-medium">{c.label}</span>
                    </button>
                  ))}
                  {/* '기타'(미분류) 안전망 칩 — 맨 끝, 해당 결과 1건 이상일 때만. category 채우기(②)로도 안 채워진 잔여가 조용히 사라지는 것 방지. */}
                  {etcResultCount > 0 && (
                    <button
                      key={ETC_KEY}
                      onClick={() => { setCategoryFilter(ETC_KEY); setCategoryPanelOpen(false) }}
                      className={`h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition ${
                        categoryFilter === ETC_KEY ? 'bg-coral text-white border-coral' : 'bg-white text-ink border-line hover:bg-surface'
                      }`}
                    >
                      <CategoryIcon k={ETC_KEY} className="w-5 h-5" />
                      <span className="text-xs font-medium">기타</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 필터 패널 (슬라이드업 시트) */}
      {filterPanelOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end md:items-center md:justify-center md:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterPanelOpen(false)} />
          <div className="relative bg-warm rounded-t-2xl shadow-2xl px-5 pt-3 pb-6 max-h-[80dvh] overflow-y-auto md:w-full md:max-w-md md:rounded-2xl">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mb-3 md:hidden" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-ink">필터</h3>
              <button onClick={() => setFilterPanelOpen(false)} aria-label="닫기" className="text-ink-muted text-xl leading-none px-1">✕</button>
            </div>

            {/* 최소 조회수 */}
            <div className="mb-5">
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-sm font-semibold text-ink">최소 조회수</label>
                <span className="text-sm font-bold text-coral">{draftViewIdx === 0 ? '전체' : `${formatCountKo(VIEW_STEPS[draftViewIdx])} 이상`}</span>
              </div>
              <input
                type="range" min={0} max={VIEW_STEPS.length - 1} step={1} value={draftViewIdx}
                onChange={(e) => setDraftViewIdx(Number(e.target.value))}
                className="w-full h-2 accent-coral"
              />
            </div>

            {/* 최소 구독자수 */}
            <div className="mb-5">
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-sm font-semibold text-ink">최소 구독자수</label>
                <span className="text-sm font-bold text-coral">{draftSubIdx === 0 ? '전체' : `${formatCountKo(SUB_STEPS[draftSubIdx])} 이상`}</span>
              </div>
              <input
                type="range" min={0} max={SUB_STEPS.length - 1} step={1} value={draftSubIdx}
                onChange={(e) => setDraftSubIdx(Number(e.target.value))}
                className="w-full h-2 accent-coral"
              />
            </div>

            {/* 업로드 날짜 (구간 칩) */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-ink mb-2">업로드 날짜</label>
              <div className="flex gap-2">
                {DATE_RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setDraftDateRange(r.key)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${draftDateRange === r.key ? 'bg-coral text-white border-coral' : 'bg-white text-ink-muted border-line hover:bg-surface'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 액션 */}
            <div className="flex gap-2">
              <button
                onClick={resetDraftFilters}
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-ink-muted bg-surface hover:bg-line-strong transition"
              >
                초기화
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] py-3 rounded-lg text-sm font-semibold text-white bg-coral hover:brightness-95 transition"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        onShowFavorites={handleShowFavorites}
        onRestartOnboarding={handleRestartOnboarding}
        onShowGuide={handleShowGuide}
        onShowInquiry={handleShowInquiry}
      />
      <GuideOverlay open={guideOverlayOpen} onClose={() => setGuideOverlayOpen(false)} />
      <InquiryOverlay open={inquiryOverlayOpen} onClose={() => setInquiryOverlayOpen(false)} />
      <LoginPromptModal open={loginPrompt !== null} feature={loginPrompt ?? undefined} onClose={() => setLoginPrompt(null)} />
      <FavoritesOverlay
        open={favoritesOverlayOpen}
        onClose={() => setFavoritesOverlayOpen(false)}
        favoriteIds={favoriteIds}
        visitedIds={visitedIds}
        onToggleFavorite={handleToggleFavoriteById}
        onToggleVisited={handleToggleVisited}
        onJumpToPlace={(lat, lng, videoId) => {
          setFavoritesOverlayOpen(false)
          panTo(lat, lng, 0)
          const match = allResults.find((r) => r.videoId === videoId)
          if (match) setSelectedVideo(match)
        }}
      />
      <OnboardingOverlay
        key={onboardingKey}
        searchBarRef={searchBarRef}
        hamburgerRef={hamburgerRef}
        hamburgerInlineRef={hamburgerInlineRef}
        channelTabRef={channelTabRef}
        onChannelStep={() => setOptionsOpen(true)}
      />

      {/* Panel backdrop — tap map to collapse expanded panel */}
      {optionsOpen && (
        <div
          className="absolute inset-0 z-[9]"
          onClick={() => setOptionsOpen(false)}
        />
      )}

      {/* Search panel / chip — ref always mounted for OnboardingOverlay */}
      <div
        ref={searchBarRef}
        className="absolute top-16 left-3 z-10 md:top-3 md:w-[400px] lg:w-[460px] md:max-w-[calc(100vw-24px)] md:flex md:items-start md:gap-2"
      >
        {/* 데스크톱: 좌측 패널 헤더의 인라인 햄버거(모바일은 플로팅 햄버거 사용) */}
        <button
          ref={hamburgerInlineRef}
          onClick={() => setMenuOpen(true)}
          aria-label="메뉴"
          className="hidden md:flex shrink-0 w-10 h-10 bg-white rounded-full shadow-lg items-center justify-center text-coral hover:bg-gray-50 transition"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="md:flex-1 md:min-w-0">
        {focusedVideoPlaces ? (
          /* 영상 단위 뷰(반경 무시 표시 중) — ✕로 반경 검색 복귀. */
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-full pl-3 pr-2 py-2 max-w-[calc(100vw-24px)] md:w-full md:max-w-none">
            <span className="text-sm shrink-0">📍</span>
            <span className="text-sm font-semibold truncate">이 영상 장소 {focusedVideoPlaces.length}곳</span>
            <button
              onClick={exitFocusedVideo}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-xs ml-0.5"
              aria-label="영상 장소 보기 닫기"
            >
              ✕
            </button>
          </div>
        ) : searchChip ? (
          /* 검색 완료 후 칩 모드 */
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-full pl-3 pr-2 py-2 max-w-[calc(100vw-24px)] md:w-full md:max-w-none">
            <span className="text-sm shrink-0">🔍</span>
            <button
              onClick={() => { setSearchChip(null); setOptionsOpen(true) }}
              className="text-sm font-medium truncate max-w-[180px] text-left"
            >
              {searchChip}
            </button>
            <button
              onClick={() => {
                setSearchChip(null)
                setKeyword('')
                setSelectedChannel(null)
                setChannelQuery('')
                setOptionsOpen(true)
              }}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-xs ml-0.5"
            >
              ✕
            </button>
          </div>
        ) : (
        /* 패널 모드 */
        <div
          className="w-72 max-w-[calc(100vw-24px)] md:w-full md:max-w-none shadow-lg rounded-2xl"
          style={{ backgroundColor: `rgba(255,255,255,${panelOpacity})` }}
        >
        {/* 입력창 — 항상 표시, 포커스 시 패널 확장 */}
        <div className="relative px-3 py-3">
          {searchMode === 'keyword' ? (
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              onFocus={() => setOptionsOpen(true)}
              placeholder="키워드 검색 (예: 한강 카페, 제주 맛집)"
              className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40 bg-white placeholder-gray-400"
            />
          ) : selectedChannel ? (
            <div
              className="flex items-center gap-1.5 text-xs font-medium text-coral border border-line rounded-lg px-3 py-2 bg-white min-w-0 cursor-pointer"
              onClick={() => setOptionsOpen(true)}
            >
              <span className="flex-1 truncate">{selectedChannel.title} 유튜버만 검색</span>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedChannel(null); setChannelQuery('') }}
                className="shrink-0 text-ink-muted hover:text-coral"
                title="유튜버 선택 해제"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                data-channel-input
                type="text"
                value={channelQuery}
                onChange={(e) => setChannelQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runChannelSearch()}
                onFocus={() => setOptionsOpen(true)}
                placeholder="유튜버 채널명으로 검색"
                className="flex-1 min-w-0 text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40 bg-white placeholder-gray-400"
              />
              <button
                onClick={runChannelSearch}
                className="shrink-0 text-sm bg-coral text-white rounded-lg px-4 py-2 font-medium hover:brightness-95 transition"
              >
                검색
              </button>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && <p className="px-3 pb-2 text-xs text-red-500">{error}</p>}

        {/* 확장 섹션 — 입력창 클릭(포커스) 시 펼쳐짐, 검색 완료 후 닫힘 */}
        <div className={`overflow-hidden transition-all duration-200 ${optionsOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
          <div className="border-t border-line">
            {/* 탭 */}
            <div className="flex gap-1 px-3 pt-3">
              <button
                onClick={() => setSearchMode('keyword')}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-full font-medium transition ${
                  searchMode === 'keyword' ? 'bg-coral text-white' : 'bg-surface text-ink-muted hover:bg-line-strong'
                }`}
              >
                <KeywordIcon className="w-3.5 h-3.5" /> 키워드 검색
              </button>
              <button
                ref={channelTabRef}
                onClick={() => setSearchMode('channel')}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-full font-medium transition ${
                  searchMode === 'channel' ? 'bg-coral text-white' : 'bg-surface text-ink-muted hover:bg-line-strong'
                }`}
              >
                <ChannelIcon className="w-3.5 h-3.5" /> 유튜버 검색
              </button>
            </div>

            {/* 반경 — 키워드 모드만 (채널은 전국 표시라 반경 무의미) */}
            {searchMode === 'keyword' && (
              <div className="flex gap-1.5 px-3 pt-2">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`flex-1 text-xs rounded-full py-1.5 border transition font-medium ${
                      radius === r
                        ? 'bg-coral text-white border-coral'
                        : 'bg-white text-ink-muted border-line hover:bg-surface'
                    }`}
                  >
                    {r}km
                  </button>
                ))}
              </div>
            )}

            {/* 검색위치 — 키워드 모드만 (채널은 위치무관, 전국 표시). "다른 지역 검색"은
                고급기능이 아니라 핵심 시나리오라 고급설정 밖(탭/반경과 같은 레벨)에 항상 노출. */}
            {searchMode === 'keyword' && (
            <div className="px-3 pt-2">
              <p className="text-xs text-gray-400 font-medium mb-1.5">📍 검색위치 직접입력</p>
              <input
                ref={addressInputRef}
                type="text"
                value={addressInput}
                onChange={(e) => handleAddressInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runLocationSearch()}
                placeholder="비워두면 현재 위치로 검색돼요"
                className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40 bg-white text-gray-900 placeholder-gray-400"
              />
              {addressInput.trim() && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={runLocationSearch}
                    disabled={addressLoading}
                    className="flex-1 text-sm bg-coral text-white rounded-lg py-2 font-medium hover:brightness-95 disabled:opacity-40 transition"
                  >
                    {addressLoading ? '검색 중…' : '🔍 검색'}
                  </button>
                  <button
                    onClick={getLocation}
                    className="shrink-0 text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 transition"
                  >
                    🎯 현재 위치로
                  </button>
                </div>
              )}
              {posLabel !== '위치 미설정' && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <p className="text-xs text-coral truncate font-medium flex-1 min-w-0">{posLabel}</p>
                  {isManualLocation && (
                    <button
                      onClick={getLocation}
                      title="지정 위치 해제하고 현재 위치로"
                      className="shrink-0 text-xs text-gray-500 hover:text-gray-700 border border-border rounded-full px-2 py-0.5 transition"
                    >✕ 현재 위치로</button>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 고급 설정 토글 + 검색하기 버튼 */}
            <div className="flex items-center gap-2 px-3 pt-2 pb-3">
              <button
                onClick={() => setAdvancedOpen((o) => !o)}
                className="text-xs text-gray-400 hover:text-gray-600 transition whitespace-nowrap"
              >
                고급 설정 {advancedOpen ? '▲' : '▼'}
              </button>
              <button
                onClick={() => handleSearch()}
                disabled={loading || !mapReady}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-coral text-white rounded-lg py-2 font-medium hover:brightness-95 disabled:opacity-40 transition"
              >
                {loading && <Spinner />}
                {loading ? LOADING_STAGES[loadingStage] : '검색하기'}
              </button>
            </div>

            {/* 고급 설정 — advancedOpen일 때만 (위치입력은 위로 승격돼 여긴 투명도만 남음) */}
            <div className={`overflow-hidden transition-all duration-200 ${advancedOpen ? 'max-h-[420px]' : 'max-h-0'}`}>
              <div className="px-3 pb-3 border-t border-line pt-3 space-y-3">
                {/* 검색창 투명도 슬라이더 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">투명도</span>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={panelOpacity}
                    onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
                    className="flex-1 accent-coral"
                    title="검색창 투명도"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
        </div>
      </div>

      {/* Quick search chips — shown below search bar in initial empty state */}
      {!searchChip && !optionsOpen && !loading && allResults.length === 0 && !selectedGroup && !selectedVideo && (
        <div className="absolute top-[130px] left-3 z-10" style={{ maxWidth: 'calc(100vw - 24px)' }}>
          {/* 첫 방문 힌트 — "뭘 해야 하지" 해소용 가벼운 리드카피. 지도 위라 흰 텍스트섀도로 가독성 확보. */}
          <p className="text-xs font-semibold text-ink mb-1.5 ml-1 [text-shadow:0_1px_2px_rgba(255,255,255,0.95)]">
            이런 걸 검색해 보세요
          </p>
          {/* 스크롤 컨테이너 + 우측 페이드/셰브론 오버레이(relative 래퍼) — 좁은 폰에서 칩이
              넘칠 때 "더 있음/스크롤" 신호. 오버레이는 pointer-events-none이라 탭 영향 없음. */}
          <div className="relative">
            <div
              className="flex gap-2 overflow-x-auto pb-1 pr-9"
              style={{ scrollbarWidth: 'none' }}
            >
              {([
                { icon: 'meat', label: '맛집' },
                { icon: 'cafe', label: '카페' },
                { icon: 'tour', label: '여행' },
                { icon: 'world', label: '데이트' },
                { icon: 'stay', label: '숙소' },
              ] as const).map(({ icon, label }) => (
                <button
                  key={label}
                  onClick={() => {
                    setKeyword(label)
                    setSearchMode('keyword')
                    handleSearch({ keywordOverride: label })
                  }}
                  className="shrink-0 flex items-center gap-1.5 bg-white shadow-sm rounded-full px-4 py-2 text-sm whitespace-nowrap hover:bg-gray-50 transition"
                >
                  <CategoryIcon k={icon} className="w-4 h-4 text-ink-muted" />
                  {label}
                </button>
              ))}
            </div>
            <div className="absolute right-0 top-0 bottom-1 w-9 flex items-center justify-end pointer-events-none bg-gradient-to-r from-transparent via-white/70 to-white">
              <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-sm text-ink-muted">
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 위치 검색결과 모달 (네이버·카카오식) */}
      <SearchResultModal<AddressSuggestion>
        open={picker === 'location'}
        onClose={() => setPicker(null)}
        query={addressInput.trim()}
        loading={addressLoading}
        items={locationSuggestions}
        keyOf={(s) => `${s.lat},${s.lng},${s.name}`}
        onSelect={selectLocationSuggestion}
        emptyText="일치하는 장소를 찾을 수 없습니다."
        renderItem={(s) => (
          <>
            <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{s.address}</p>
          </>
        )}
      />

      {/* 채널 검색결과 모달 — 클릭 시 바로 그 채널로 검색 */}
      <SearchResultModal<ChannelSuggestion>
        open={picker === 'channel'}
        onClose={() => setPicker(null)}
        query={channelQuery.trim()}
        loading={channelSearching}
        items={channelSuggestions}
        keyOf={(c) => c.channelId}
        onSelect={(c) => { setSelectedChannel(c); handleSearch({ channelOverride: c }) }}
        emptyText="유튜버를 찾을 수 없습니다."
        renderItem={(c) => (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.thumbnail} alt="" className="w-11 h-11 rounded-full shrink-0 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-2">{c.title}</p>
              {c.subscriberCount != null && (
                <p className="text-xs text-gray-400 mt-0.5">구독자 {formatCountKo(c.subscriberCount)}명</p>
              )}
            </div>
          </div>
        )}
      />

      {/* Search loading skeleton */}
      {loading && allResults.length === 0 && (
        <div className={`absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl px-3 pb-4 pt-3 ${DESKTOP_LEFT_PANEL}`}>
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 md:hidden" />
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Spinner />
            <span className="text-xs font-medium text-gray-500">{LOADING_STAGES[loadingStage]}</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2 py-2.5 border-b border-border last:border-0 animate-pulse">
              <div className="w-14 h-8 md:w-24 md:h-14 bg-gray-200 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 bg-gray-200 rounded w-full" />
                <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                <div className="h-2 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
      {/* No results — backdrop: tap map to dismiss */}
      {noResults && !selectedGroup && (
        <div className="absolute inset-0 z-[9]" onClick={() => setLastSearchQuery(null)} />
      )}

      {/* No results state */}
      {noResults && !selectedGroup && (() => {
        const q = (lastSearchQuery ?? '').toLowerCase()
        let chips: string[]
        if (/맛집|음식|식당|밥|레스토랑|한식|중식|일식|양식|치킨|피자|고기|술/.test(q)) {
          chips = ['레스토랑', '한식', '양식', '일식', '브런치']
        } else if (/카페|커피|디저트|케이크|빵|베이커리/.test(q)) {
          chips = ['커피', '디저트', '브런치', '베이커리']
        } else if (/여행|관광|명소|핫플|숙소|호텔|펜션/.test(q)) {
          chips = ['관광지', '핫플', '명소', '숙소']
        } else {
          chips = ['맛집', '카페', '여행', '숙소']
        }
        return (
          <div className="absolute top-[140px] left-1/2 -translate-x-1/2 z-10 w-72 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl px-4 py-4">
            <button
              onClick={() => setLastSearchQuery(null)}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-xs"
            >
              ✕
            </button>
            <p className="text-sm font-semibold text-gray-800 mb-1 text-center">
              이 지역에서 &lsquo;{lastSearchQuery}&rsquo; 결과가 없어요
            </p>
            <p className="text-xs text-gray-400 text-center mb-3">다른 키워드로 찾아볼까요?</p>
            <div className="flex flex-wrap gap-1.5 justify-center mb-3">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setKeyword(chip)
                    setSearchMode('keyword')
                    handleSearch({ keywordOverride: chip })
                  }}
                  className="text-xs border border-gray-800 text-gray-800 rounded-full px-3 py-1 hover:bg-gray-800 hover:text-white transition font-medium"
                >
                  {chip}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
              더 많은 장소는 유튜버 파트너가 늘어날수록 채워집니다
            </p>
          </div>
        )
      })()}
      {/* Results list — independent bottom sheet, slides up from the bottom */}
      {allResults.length > 0 && !selectedGroup && !selectedVideo && (
        <div
          className={`absolute left-0 right-0 bottom-0 z-10 bg-warm rounded-t-2xl shadow-2xl transition-transform duration-300 flex flex-col max-h-[50dvh] ${DESKTOP_LEFT_PANEL} md:top-[64px] md:max-h-none md:translate-y-0 ${
            listOpen ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'
          }`}
        >
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              handleSheetDragStart(e.clientY)
            }}
            onPointerMove={(e) => handleSheetDragMove(e.clientY)}
            onPointerUp={handleSheetDragEnd}
            className="shrink-0 cursor-grab touch-none md:cursor-default"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1.5 md:hidden" />
            <button
              onClick={() => setListOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 pb-3 md:pt-3 text-xs text-ink-muted font-medium border-b border-line"
            >
              <span className="truncate">
                {searchMode === 'channel' && selectedChannel && (
                  <ChannelIcon className="inline-block w-3 h-3 -mt-0.5 mr-1" />
                )}
                {searchMode === 'channel' && selectedChannel ? selectedChannel.title : `"${keyword}"`} 검색결과 {filteredResults.length}개
              </span>
              <span className="shrink-0 ml-2 md:hidden">{listOpen ? '닫기 ▼' : '열기 ▲'}</span>
            </button>
          </div>
          <div className={`flex gap-1.5 px-3 py-2 border-b border-line shrink-0 ${focusedVideoPlaces ? 'hidden' : ''}`}>
            {([['all', '전체'] as const, ['long', null] as const, ['short', null] as const]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setVideoFilter(key)}
                title={key === 'long' ? '영상' : key === 'short' ? '쇼츠' : '전체'}
                className={`flex-1 flex items-center justify-center gap-1 text-xs rounded-lg py-1.5 border transition font-medium ${
                  videoFilter === key
                    ? 'bg-coral text-white border-coral'
                    : 'bg-white text-ink-muted border-line hover:bg-surface'
                }`}
              >
                {key === 'long' ? (
                  <><LongformIcon className="w-4 h-4" active={videoFilter === 'long'} /> 영상</>
                ) : key === 'short' ? (
                  <><ShortsIcon className="w-4 h-4" active={videoFilter === 'short'} /> 쇼츠</>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>
          <div className={`flex gap-1.5 px-3 py-2 border-b border-line shrink-0 ${focusedVideoPlaces ? 'hidden' : ''}`}>
            {([['views', '조회수'], ['duration', '영상길이'], ['distance', '거리(가까운)']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-1 text-xs rounded-full py-1.5 border transition font-medium ${
                  sortBy === key
                    ? 'bg-coral text-white border-coral'
                    : 'bg-white text-ink-muted border-line hover:bg-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            {!focusedVideoPlaces && filteredResults.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-6">
                <p className="text-sm text-gray-400">
                  {videoFilter === 'all' && categoryFilter === 'all' ? '조건에 맞는 영상이 없어요' : '이 필터에 맞는 영상이 없어요'}
                </p>
                {videoFilter !== 'all' || categoryFilter !== 'all' ? (
                  <button
                    onClick={() => { setVideoFilter('all'); setCategoryFilter('all') }}
                    className="text-xs text-coral hover:text-coral-ink font-medium"
                  >
                    전체 보기로 전환
                  </button>
                ) : (
                  <p className="text-xs text-gray-400">반경을 넓히거나 다른 키워드로 검색해보세요</p>
                )}
              </div>
            )}
            {(focusedVideoPlaces ?? sortedResults).map((v, vi) => (
              <div
                // 모음영상은 같은 videoId가 여러 좌표로 중복 → videoId만으론 React key 충돌이 나서
                // 필터로 줄 때 옛 DOM이 안 지워졌음. videoId+좌표로 고유화.
                key={`${v.videoId}:${v.lat}:${v.lng}`}
                className="flex items-start gap-2 px-3 py-2 hover:bg-surface transition border-b border-line last:border-0"
              >
                <div className="relative shrink-0 cursor-pointer" onClick={() => setSelectedVideo(v)}>
                  {/* 영상 단위 뷰: 챕터 순번(지도 번호마커와 일치). */}
                  {focusedVideoPlaces && (
                    <div className="absolute top-0.5 left-0.5 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[11px] font-bold flex items-center justify-center shadow">{vi + 1}</div>
                  )}
                  <img src={v.thumbnail} alt="" className="w-[120px] h-[70px] md:w-40 md:h-[90px] object-cover rounded" />
                  {/* ▶ 오버레이 — 탭 시 즉시 재생(YouTube 정책 C: 재생 트리거 썸네일 표시) */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-9 h-9 bg-black/50 rounded-full flex items-center justify-center shadow-sm">
                      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[11px] border-l-white ml-0.5" />
                    </div>
                  </div>
                  <DurationBadge duration={v.duration} isShort={v.isShort} className="bottom-0.5 right-0.5" />
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  <CardBadgeRow v={v} />
                  <p
                    className="text-xs font-medium line-clamp-2 leading-tight cursor-pointer hover:text-coral"
                    onClick={() => setSelectedVideo(v)}
                  >
                    {decodeHtmlEntities(v.title)}
                  </p>
                  {/* YouTube 출처 표시(약관 즉시항목 5): 워드마크/로고 아닌 텍스트 캡션 */}
                  <p className="text-[11px] text-gray-400 leading-tight mt-0.5">출처: YouTube</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {v.placeName && (
                      <p className="text-xs font-semibold text-gray-700 truncate">📍 {v.placeName}</p>
                    )}
                    <span className="shrink-0 text-xs font-bold text-coral bg-coral-soft rounded px-1.5 py-0.5">
                      {v.distanceKm}km
                    </span>
                  </div>
                  {/* 모음영상 → 이 영상의 모든 장소를 반경 무시하고 지도에 표시(별도 엔드포인트). */}
                  {v.isCompilation && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleShowVideoPlaces(v) }}
                      disabled={focusedLoading}
                      className="mt-1 text-xs font-semibold text-coral hover:text-coral-ink disabled:opacity-50"
                    >
                      이 영상 장소 전체 보기 →
                    </button>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* 모바일: 한 줄 truncate(기존). 데스크톱(md+): flex로 채널명만 truncate하고
                        PARTNER 배지·조회수는 항상 노출(채널명이 길어도 배지 안 잘리게). */}
                    <p className="text-xs text-gray-400 truncate flex-1 min-w-0 md:flex md:items-center md:gap-1 md:overflow-visible md:whitespace-normal">
                      {v.subscriberTier && <TierButton tier={v.subscriberTier} />}
                      {v.channel && <span className="md:truncate md:min-w-0">{' '}{v.channel}</span>}
                      <span className="md:shrink-0 md:whitespace-nowrap"> · {formatViews(v.viewCount)}</span>
                    </p>
                    <a
                      href={navUrl(v, userPos ? { ...userPos, label: posLabel } : null)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                      title="길찾기"
                    >
                      <NaviIcon className="w-6 h-6" />
                    </a>
                    <VideoActionRow
                      favorited={favoriteIds.has(placeKey(v.videoId, v.lat, v.lng))}
                      visited={visitedIds.has(placeKey(v.videoId, v.lat, v.lng))}
                      reported={reportedIds.has(v.videoId)}
                      onToggleFavorite={() => handleToggleFavorite(v)}
                      onToggleVisited={() => handleToggleVisitedVideo(v)}
                      onShare={() => handleShare(v)}
                      onReport={() => handleReport(v)}
                      onHide={() => handleHideVideo(v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (구 컴팩트 플레이어 + 그룹 바텀시트는 옵션 A 통합 watch 모달로 대체됨 —
          그룹 마커도 아래 watch 모달에서 자동재생 + 카드 + 나머지 리스트로 처리한다.) */}

      {/* Watch 모달 — 단일 마커 + 그룹 마커 공통(옵션 A 통합형). selectedVideo가 있으면 재생.
          그룹이면 카드 아래에 "이 위치의 다른 영상" 리스트를 붙여 한 스크롤로 전환 가능. */}
      {selectedVideo && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          onClick={() => { setSelectedGroup(null); setSelectedVideo(null) }}
        >
          <div
            className="relative bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg md:max-w-2xl mx-4 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단 영상(고정) + 하단 정보·나머지 리스트(세로 스크롤). */}
            <div className="shrink-0">
              <PlayerFrame video={selectedVideo} portraitMaxVh={44} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PlaceInfoPanel
                video={selectedVideo}
                isPartner={isPartnerVideo(selectedVideo)}
                favorited={favoriteIds.has(placeKey(selectedVideo.videoId, selectedVideo.lat, selectedVideo.lng))}
                visited={visitedIds.has(placeKey(selectedVideo.videoId, selectedVideo.lat, selectedVideo.lng))}
                reported={reportedIds.has(selectedVideo.videoId)}
                navUrl={navUrl(selectedVideo, userPos ? { ...userPos, label: posLabel } : null)}
                onToggleFavorite={() => handleToggleFavorite(selectedVideo)}
                onToggleVisited={() => handleToggleVisitedVideo(selectedVideo)}
                onShare={() => handleShare(selectedVideo)}
                onReport={() => handleReport(selectedVideo)}
                onHide={() => handleHideVideo(selectedVideo)}
              />
              {/* 그룹 마커: 같은 위치의 다른 영상(정렬 동일, 현재 재생중 제외). 행 클릭 → 재생/카드 전환. */}
              {selectedGroup && selectedGroup.videos.length > 1 && (
                <div className="border-t border-line mt-1">
                  <p className="px-4 pt-3 pb-1.5 text-[13px] font-bold" style={{ color: '#2a2320' }}>이 위치의 다른 영상</p>
                  {sortVideos(selectedGroup.videos, sortBy)
                    .filter((v) => v.videoId !== selectedVideo.videoId)
                    .map(renderGroupVideoRow)}
                </div>
              )}
            </div>
            <button
              onClick={() => { setSelectedGroup(null); setSelectedVideo(null) }}
              className="absolute top-3 right-3 bg-white/80 rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-white shadow"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Report reason modal */}
      {reportTarget && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !reportSubmitting && setReportTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold mb-3">위치 오류 신고</p>
            <div className="space-y-2 mb-3">
              {REPORT_REASONS.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="reportReason"
                    checked={reportReason === r.key}
                    onChange={() => setReportReason(r.key)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {reportReason === 'wrong_address' && (
              <>
                {/* What's wrong — checked independently so a name-only fix
                    doesn't move the pin, and an address-only fix doesn't
                    overwrite a perfectly good business name. */}
                <div className="flex gap-3 mb-2 px-1">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reportFixAddress}
                      onChange={(e) => setReportFixAddress(e.target.checked)}
                    />
                    주소가 잘못됐어요
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reportFixName}
                      onChange={(e) => setReportFixName(e.target.checked)}
                    />
                    상호명이 잘못됐어요
                  </label>
                </div>
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={reportSelected ? `${reportSelected.name} (${reportSelected.address})` : reportQuery}
                    onChange={(e) => handleReportQueryChange(e.target.value)}
                    placeholder="정확한 장소명이나 주소를 검색해보세요 (예: 엄마네돼지찌개)"
                    className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40 bg-white text-gray-900 placeholder-gray-400"
                  />
                  {addressSearching && (
                    <p className="text-xs text-gray-400 mt-1">검색 중…</p>
                  )}
                  {addressSuggestions.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {addressSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setReportSelected(s)
                            setAddressSuggestions([])
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-border last:border-0 transition"
                        >
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.address}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {reportResult && <p className="text-xs text-gray-600 mb-3">{reportResult}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setReportTarget(null)}
                disabled={reportSubmitting}
                className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg py-2 font-medium transition disabled:opacity-40"
              >
                취소
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={
                  reportSubmitting ||
                  (reportReason === 'wrong_address' &&
                    (!reportSelected || (!reportFixAddress && !reportFixName)))
                }
                className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-coral text-white rounded-lg py-2 font-medium hover:brightness-95 transition disabled:opacity-40"
              >
                {reportSubmitting && <Spinner />}
                {reportSubmitting ? '제출 중…' : '제출'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
