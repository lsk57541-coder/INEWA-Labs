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
import SearchResultModal from '@/components/SearchResultModal'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

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
  f: { videoFilter: 'all' | 'short' | 'long'; minViews: number; minSubs: number; dateMin: number }
): boolean {
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

const FAVORITE_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="36" viewBox="0 0 32 36">' +
  '<path d="M16 0C7 0 0 7 0 16c0 12 16 20 16 20s16-8 16-20C32 7 25 0 16 0z" fill="#f59e0b" stroke="#fff" stroke-width="2"/>' +
  '<text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff">♥</text>' +
  '</svg>'

function favoriteMarkerImage(): kakao.maps.MarkerImage {
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(FAVORITE_MARKER_SVG)}`,
    new kakao.maps.Size(24, 27),
    { offset: new kakao.maps.Point(12, 27) }
  )
}

const VISITED_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="36" viewBox="0 0 32 36">' +
  '<path d="M16 0C7 0 0 7 0 16c0 12 16 20 16 20s16-8 16-20C32 7 25 0 16 0z" fill="#475569" stroke="#fff" stroke-width="2"/>' +
  '<text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff">⚑</text>' +
  '</svg>'

function visitedMarkerImage(): kakao.maps.MarkerImage {
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(VISITED_MARKER_SVG)}`,
    new kakao.maps.Size(24, 27),
    { offset: new kakao.maps.Point(12, 27) }
  )
}

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
// "long-form video" and "Shorts" in the filter tabs.
function LongformIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <title>롱폼</title>
      <rect x="1" y="4" width="22" height="16" rx="4" fill="#FF0000" />
      <polygon points="10,8.5 10,15.5 16,12" fill="#fff" />
    </svg>
  )
}

function ShortsIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <title>쇼츠</title>
      <rect x="7" y="2" width="10" height="20" rx="4" fill="#FF0000" />
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

// Just the play triangle — no phone-frame outline — for both Shorts and
// long-form, and a small dot when a location has both.
function videoTypeGlyphSvg(kind: 'short' | 'long' | 'mixed'): string {
  if (kind === 'mixed') return '<circle cx="16" cy="12" r="3" fill="#fff"/>'
  return '<polygon points="9,8 9,16 19,12" fill="#fff"/>'
}

function pinMarkerImage(fill: string, innerSvg: string): kakao.maps.MarkerImage {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="36" viewBox="0 0 32 36">' +
    `<path d="M16 0C7 0 0 7 0 16c0 12 16 20 16 20s16-8 16-20C32 7 25 0 16 0z" fill="${fill}" stroke="#fff" stroke-width="2"/>` +
    innerSvg +
    '</svg>'
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(24, 27),
    { offset: new kakao.maps.Point(12, 27) }
  )
}

// YouTube-red hue, darker for channels with more subscribers and lighter for
// fewer — a gradient instead of distinct gold/silver/bronze colors.
function subscriberGradientColor(subscriberCount: number): string {
  const clamped = Math.min(Math.max(subscriberCount, 1), 10_000_000)
  const t = Math.log10(clamped) / Math.log10(10_000_000) // 0 (few subs) .. 1 (many subs)
  const lightness = 70 - t * 35 // 70% light .. 35% dark
  return `hsl(0, 85%, ${lightness}%)`
}

// Picks the marker look for a group of videos at one location: favorited
// places keep the gold-heart marker, "가본 곳" places keep the gray-flag
// marker, and otherwise the pin's shade shows how many subscribers the
// best-known channel there has, with a shape showing whether the videos
// there are Shorts, long-form, or a mix of both.
function groupMarkerImage(videos: VideoResult[], isFavorite: boolean, isVisited: boolean): kakao.maps.MarkerImage {
  if (isFavorite) return favoriteMarkerImage()
  if (isVisited) return visitedMarkerImage()

  const maxSubs = Math.max(0, ...videos.map((v) => v.subscriberCount))
  const allShort = videos.every((v) => v.isShort)
  const allLong = videos.every((v) => !v.isShort)
  const kind = allShort ? 'short' : allLong ? 'long' : 'mixed'
  return pinMarkerImage(subscriberGradientColor(maxSubs), videoTypeGlyphSvg(kind))
}

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
        title={isShort ? '쇼츠' : '롱폼'}
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
  return (
    <div className="flex items-center gap-3 shrink-0 relative">
      <button
        onClick={onToggleFavorite}
        title={favorited ? '찜 취소' : '찜하기'}
        className="text-gray-300 hover:text-amber-400 transition-colors duration-150"
      >
        <HeartIcon filled={favorited} />
      </button>
      <button
        onClick={onToggleVisited}
        title={visited ? '방문 취소' : '가봤어요'}
        className="text-gray-300 hover:text-green-500 transition-colors duration-150"
      >
        <CheckCircleIcon checked={visited} />
      </button>
      <button
        onClick={onShare}
        title="공유"
        className="text-gray-400 hover:text-gray-600 transition-colors duration-150"
      >
        <ShareIcon />
      </button>
      <button
        onClick={() => setMoreOpen((o) => !o)}
        title="더보기"
        className="text-gray-300 hover:text-gray-500 transition text-base leading-none tracking-widest"
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
  const [mapReady, setMapReady] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [favoritesOverlayOpen, setFavoritesOverlayOpen] = useState(false)
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
    kakao.maps.load(() => {
      mapInstanceRef.current = new kakao.maps.Map(mapRef.current!, {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 7,
      })
      setMapReady(true)
    })
  }, [])

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

  // 지도 준비 후 sessionStorage에서 마지막 검색 상태 복원
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return
    try {
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
      setFavoriteIds(new Set(favs.map((f) => f.video_id)))
      setVisitedIds(new Set(vis.map((v) => v.video_id)))
      setReportedIds(new Set(reports))
    }
    load().catch(() => {})
  }, [user])

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
      fitAll = false
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

      groups.forEach((group) => {
        const pos = new kakao.maps.LatLng(group.lat, group.lng)
        const isFavorite = group.videos.some((v) => favIds.has(v.videoId))
        const isVisited = group.videos.some((v) => visitedIdSet.has(v.videoId))
        const marker = new kakao.maps.Marker({
          position: pos,
          map: mapInstanceRef.current!,
          image: groupMarkerImage(group.videos, isFavorite, isVisited),
        })
        kakao.maps.event.addListener(marker, 'click', () => {
          if (group.videos.length === 1) {
            setSelectedGroup(null)
            setSelectedVideo(group.videos[0])
            panTo(group.lat, group.lng, 0)
          } else {
            setSelectedGroup(group)
            setSelectedVideo(group.videos[0])
            panTo(group.lat, group.lng, 0.45)
          }
        })
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
    if (!user) { setError('로그인이 필요합니다.'); return }
    const wasFavorited = favoriteIds.has(v.videoId)
    const next = new Set(favoriteIds)
    if (wasFavorited) next.delete(v.videoId)
    else next.add(v.videoId)
    setFavoriteIds(next)   // 마커 갱신은 useEffect(favoriteIds 의존)가 처리

    try {
      await toggleFavorite(toFavoritePayload(v))
    } catch (e) {
      setFavoriteIds(favoriteIds)
      setError(e instanceof Error ? e.message : '찜하기 실패')
    }
  }

  const handleToggleVisitedVideo = async (v: VideoResult) => {
    if (!user) { setError('로그인이 필요합니다.'); return }
    const wasVisited = visitedIds.has(v.videoId)
    const next = new Set(visitedIds)
    if (wasVisited) next.delete(v.videoId)
    else next.add(v.videoId)
    setVisitedIds(next)   // 마커 갱신은 useEffect(visitedIds 의존)가 처리

    try {
      await toggleVisited(toFavoritePayload(v))
    } catch (e) {
      setVisitedIds(visitedIds)
      setError(e instanceof Error ? e.message : '표시 실패')
    }
  }

  const handleToggleFavoriteById = async (v: FavoriteVideo) => {
    const wasFavorited = favoriteIds.has(v.video_id)
    const next = new Set(favoriteIds)
    if (wasFavorited) next.delete(v.video_id)
    else next.add(v.video_id)
    setFavoriteIds(next)
    try {
      await toggleFavorite(v)
    } catch (e) {
      setFavoriteIds(favoriteIds)
      setError(e instanceof Error ? e.message : '찜하기 실패')
    }
  }

  const handleToggleVisited = async (v: FavoriteVideo) => {
    const wasVisited = visitedIds.has(v.video_id)
    const next = new Set(visitedIds)
    if (wasVisited) next.delete(v.video_id)
    else next.add(v.video_id)
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
    if (!q) { setError('채널명을 입력해주세요.'); return }
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
    if (!user) { setError('로그인이 필요합니다.'); return }
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
    if (!user) { setError('로그인이 필요합니다.'); return }
    setFavoritesOverlayOpen(true)
  }

  // 거르기(필터): 마커+리스트 공통 집합. 정렬 전 단계라 마커 그룹핑에 그대로 쓴다.
  const filteredResults = allResults.filter((v) =>
    passesFilters(v, { videoFilter, minViews, minSubs, dateMin: dateCutoff(dateRange) })
  )

  // 리스트 표시는 정렬 적용본. (마커는 filteredResults를 써서 정렬 변경 시 불필요 재렌더 방지.)
  const sortedResults = filteredResults
    .slice()
    .sort((a, b) => {
      if (sortBy === 'distance') return a.distanceKm - b.distanceKm
      if (sortBy === 'duration') return parseDurationLabel(b.duration) - parseDurationLabel(a.duration)
      return b.viewCount - a.viewCount
    })

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

  // ── 마커 단일 렌더 소스 ──
  // 검색/조회수·구독자·날짜/롱폼·쇼츠/찜·가본곳/신고삭제 등 무엇이 바뀌든, 마커는 항상
  // filteredResults(= 리스트 sortedResults와 동일 집합)를 반영해 다시 그린다. (흩어진 명령형
  // 호출을 없애 마커-리스트 불일치를 제거.) center 미설정(검색 전)이면 건너뜀.
  useEffect(() => {
    if (!lastCenterRef.current) return
    renderMarkers(
      groupByLocation(filteredResults, clusterThresholdKm(radius)),
      lastCenterRef.current,
      favoriteIds,
      visitedIds,
      currentSheetFraction,
      searchMode === 'channel'
    )
    // filteredResults는 아래 입력들로 파생되므로 그 입력들을 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, videoFilter, minViews, minSubs, dateRange, favoriteIds, visitedIds])

  // Keep the locate-me button clear of whichever bottom sheet is currently
  // showing (results list or a marker group's video list), instead of
  // floating on top of it.
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
        className={`absolute ${locateButtonBottomClass} left-3 z-20 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-blue-600 hover:bg-gray-50 transition`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>

      {/* Hamburger menu */}
      <button
        ref={hamburgerRef}
        onClick={() => setMenuOpen(true)}
        className="absolute top-3 left-3 z-20 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-lg hover:bg-gray-50 transition"
      >
        ☰
      </button>

      {/* 결과 필터 버튼 (우측 상단) — 결과가 있을 때만. 활성 시 "전체→남은" 개수 표시. */}
      {allResults.length > 0 && (
        <button
          onClick={openFilterPanel}
          title="검색결과 필터"
          aria-label="검색결과 필터"
          className={`absolute top-3 right-3 z-20 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition ${filterActive ? 'gap-1.5 px-3' : 'w-10'}`}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={filterActive ? 'text-blue-600' : 'text-gray-700'}>
            <line x1="4" y1="7" x2="20" y2="7" />
            <circle cx="9" cy="7" r="2.4" fill="white" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <circle cx="15" cy="12" r="2.4" fill="white" />
            <line x1="4" y1="17" x2="20" y2="17" />
            <circle cx="11" cy="17" r="2.4" fill="white" />
          </svg>
          {filterActive && (
            <span className="text-xs font-bold text-blue-600 tabular-nums">{allResults.length}→{filteredResults.length}</span>
          )}
        </button>
      )}

      {/* 필터 패널 (슬라이드업 시트) */}
      {filterPanelOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterPanelOpen(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-2xl px-5 pt-3 pb-6 max-h-[80dvh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">필터</h3>
              <button onClick={() => setFilterPanelOpen(false)} aria-label="닫기" className="text-gray-400 text-xl leading-none px-1">✕</button>
            </div>

            {/* 최소 조회수 */}
            <div className="mb-5">
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-sm font-semibold text-gray-800">최소 조회수</label>
                <span className="text-sm font-bold text-blue-600">{draftViewIdx === 0 ? '전체' : `${formatCountKo(VIEW_STEPS[draftViewIdx])} 이상`}</span>
              </div>
              <input
                type="range" min={0} max={VIEW_STEPS.length - 1} step={1} value={draftViewIdx}
                onChange={(e) => setDraftViewIdx(Number(e.target.value))}
                className="w-full h-2 accent-blue-600"
              />
            </div>

            {/* 최소 구독자수 */}
            <div className="mb-5">
              <div className="flex justify-between items-baseline mb-2">
                <label className="text-sm font-semibold text-gray-800">최소 구독자수</label>
                <span className="text-sm font-bold text-blue-600">{draftSubIdx === 0 ? '전체' : `${formatCountKo(SUB_STEPS[draftSubIdx])} 이상`}</span>
              </div>
              <input
                type="range" min={0} max={SUB_STEPS.length - 1} step={1} value={draftSubIdx}
                onChange={(e) => setDraftSubIdx(Number(e.target.value))}
                className="w-full h-2 accent-blue-600"
              />
            </div>

            {/* 업로드 날짜 (구간 칩) */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-800 mb-2">업로드 날짜</label>
              <div className="flex gap-2">
                {DATE_RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setDraftDateRange(r.key)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${draftDateRange === r.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
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
                className="flex-1 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
              >
                초기화
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] py-3 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
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
      />
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
      <OnboardingOverlay key={onboardingKey} searchBarRef={searchBarRef} hamburgerRef={hamburgerRef} />

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
        className="absolute top-16 left-3 z-10"
      >
        {searchChip ? (
          /* 검색 완료 후 칩 모드 */
          <div className="flex items-center gap-1 bg-white shadow-lg rounded-full pl-3 pr-2 py-2 max-w-[calc(100vw-24px)]">
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
          className="w-72 max-w-[calc(100vw-24px)] shadow-lg rounded-2xl"
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
              className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white placeholder-gray-400"
            />
          ) : selectedChannel ? (
            <div
              className="flex items-center gap-1.5 text-xs font-medium text-blue-700 border border-border rounded-lg px-3 py-2 bg-white min-w-0 cursor-pointer"
              onClick={() => setOptionsOpen(true)}
            >
              <span className="flex-1 truncate">{selectedChannel.title} 채널만 검색</span>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedChannel(null); setChannelQuery('') }}
                className="shrink-0 text-blue-400 hover:text-blue-600"
                title="채널 선택 해제"
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
                className="flex-1 min-w-0 text-sm border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white placeholder-gray-400"
              />
              <button
                onClick={runChannelSearch}
                className="shrink-0 text-sm bg-blue-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-blue-700 transition"
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
          <div className="border-t border-border">
            {/* 탭 */}
            <div className="flex gap-1 px-3 pt-3">
              <button
                onClick={() => setSearchMode('keyword')}
                className={`flex-1 text-xs py-1.5 rounded-full font-medium transition ${
                  searchMode === 'keyword' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🔎 키워드 검색
              </button>
              <button
                onClick={() => setSearchMode('channel')}
                className={`flex-1 text-xs py-1.5 rounded-full font-medium transition ${
                  searchMode === 'channel' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🎙 채널 검색
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
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-gray-600 border-border hover:bg-gray-50'
                    }`}
                  >
                    {r}km
                  </button>
                ))}
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
                className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-black text-white rounded-lg py-2 font-medium hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {loading && <Spinner />}
                {loading ? LOADING_STAGES[loadingStage] : '검색하기'}
              </button>
            </div>

            {/* 고급 설정 — advancedOpen일 때만 */}
            <div className={`overflow-hidden transition-all duration-200 ${advancedOpen ? 'max-h-[420px]' : 'max-h-0'}`}>
              <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                {/* 위치 직접입력 — 키워드 모드만 (채널은 위치무관, 전국 표시) */}
                {searchMode === 'keyword' && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1.5">📍 검색위치 직접입력</p>
                  <input
                    ref={addressInputRef}
                    type="text"
                    value={addressInput}
                    onChange={(e) => handleAddressInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runLocationSearch()}
                    placeholder="지역명 또는 주소 입력"
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
                  />
                  {addressInput.trim() && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={runLocationSearch}
                        disabled={addressLoading}
                        className="flex-1 text-sm bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-40 transition"
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
                      <p className="text-xs text-blue-600 truncate font-medium flex-1 min-w-0">{posLabel}</p>
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
                    className="flex-1 accent-blue-600"
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

      {/* Quick search chips — shown below search bar in initial empty state */}
      {!searchChip && !optionsOpen && !loading && allResults.length === 0 && !selectedGroup && !selectedVideo && (
        <div className="absolute top-[130px] left-3 z-10" style={{ maxWidth: 'calc(100vw - 24px)' }}>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {([
              { emoji: '🍽', label: '맛집' },
              { emoji: '☕', label: '카페' },
              { emoji: '✈️', label: '여행' },
              { emoji: '💑', label: '데이트' },
              { emoji: '🏨', label: '숙소' },
            ] as const).map(({ emoji, label }) => (
              <button
                key={label}
                onClick={() => {
                  setKeyword(label)
                  setSearchMode('keyword')
                  handleSearch({ keywordOverride: label })
                }}
                className="shrink-0 bg-white shadow-sm rounded-full px-4 py-2 text-sm whitespace-nowrap hover:bg-gray-50 transition"
              >
                {emoji} {label}
              </button>
            ))}
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
        emptyText="채널을 찾을 수 없습니다."
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
        <div className="absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl px-3 pb-4 pt-3">
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Spinner />
            <span className="text-xs font-medium text-gray-500">{LOADING_STAGES[loadingStage]}</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2 py-2.5 border-b border-border last:border-0 animate-pulse">
              <div className="w-14 h-8 bg-gray-200 rounded shrink-0" />
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
          className={`absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 flex flex-col ${
            listOpen ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'
          }`}
          style={{ maxHeight: '50dvh' }}
        >
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              handleSheetDragStart(e.clientY)
            }}
            onPointerMove={(e) => handleSheetDragMove(e.clientY)}
            onPointerUp={handleSheetDragEnd}
            className="shrink-0 cursor-grab touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1.5" />
            <button
              onClick={() => setListOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 pb-3 text-xs text-gray-500 font-medium border-b border-border"
            >
              <span className="truncate">
                {searchMode === 'channel' && selectedChannel ? `🎙 ${selectedChannel.title}` : `"${keyword}"`} 검색결과 {filteredResults.length}개
              </span>
              <span className="shrink-0 ml-2">{listOpen ? '닫기 ▼' : '열기 ▲'}</span>
            </button>
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-b border-border shrink-0">
            {([['all', '전체'] as const, ['long', null] as const, ['short', null] as const]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setVideoFilter(key)}
                title={key === 'long' ? '롱폼' : key === 'short' ? '쇼츠' : '전체'}
                className={`flex-1 flex items-center justify-center gap-1 text-xs rounded-lg py-1.5 border transition font-medium ${
                  videoFilter === key
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-border hover:bg-gray-50'
                }`}
              >
                {key === 'long' ? (
                  <><LongformIcon className="w-4 h-4" /> 롱폼</>
                ) : key === 'short' ? (
                  <><ShortsIcon className="w-4 h-4" /> 쇼츠</>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-b border-border shrink-0">
            {([['views', '조회수'], ['duration', '영상길이'], ['distance', '거리(가까운)']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-1 text-xs rounded-full py-1.5 border transition font-medium ${
                  sortBy === key
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white text-gray-600 border-border hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredResults.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-6">
                <p className="text-sm text-gray-400">
                  {videoFilter === 'all' ? '조건에 맞는 영상이 없어요' : '이 필터에 맞는 영상이 없어요'}
                </p>
                {videoFilter !== 'all' ? (
                  <button
                    onClick={() => setVideoFilter('all')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    전체 보기로 전환
                  </button>
                ) : (
                  <p className="text-xs text-gray-400">반경을 넓히거나 다른 키워드로 검색해보세요</p>
                )}
              </div>
            )}
            {sortedResults.map((v) => (
              <div
                // 모음영상은 같은 videoId가 여러 좌표로 중복 → videoId만으론 React key 충돌이 나서
                // 필터로 줄 때 옛 DOM이 안 지워졌음. videoId+좌표로 고유화.
                key={`${v.videoId}:${v.lat}:${v.lng}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition border-b border-border last:border-0"
              >
                <div className="relative shrink-0 cursor-pointer" onClick={() => setSelectedVideo(v)}>
                  <img src={v.thumbnail} alt="" className="w-14 h-8 object-cover rounded" />
                  <DurationBadge duration={v.duration} isShort={v.isShort} className="bottom-0.5 right-0.5" />
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  <p
                    className="text-xs font-medium line-clamp-2 leading-tight cursor-pointer hover:text-blue-600"
                    onClick={() => setSelectedVideo(v)}
                  >
                    {decodeHtmlEntities(v.title)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {v.placeName && (
                      <p className="text-xs font-semibold text-gray-700 truncate">📍 {v.placeName}</p>
                    )}
                    <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                      {v.distanceKm}km
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400 truncate flex-1">
                      {v.subscriberTier && <TierButton tier={v.subscriberTier} />} {formatViews(v.viewCount)}
                      {v.source === 'ai' && <span className="ml-1 text-purple-400">AI</span>}
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
                      favorited={favoriteIds.has(v.videoId)}
                      visited={visitedIds.has(v.videoId)}
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

      {/* Compact video player — shown above group list when multi-video marker auto-plays */}
      {selectedGroup && selectedVideo && (
        <div
          className="absolute left-0 right-0 z-20 shadow-2xl md:max-w-2xl md:mx-auto"
          style={{ bottom: 'calc(45dvh + 6px)' }}
        >
          <div className="relative">
            <PlayerFrame video={selectedVideo} portraitMaxVh={50} />
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Video list — bottom sheet capped under half the screen, shown when a map marker is clicked */}
      {selectedGroup && (
        <div
          className="absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: '45dvh' }}
        >
          <div className="pt-2 pb-0 flex justify-center shrink-0">
            <div className="w-10 h-1.5 bg-gray-200 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50 shrink-0">
            <div>
              <p className="text-sm font-bold">이 위치의 영상</p>
              <p className="text-xs text-gray-400 mt-0.5">{selectedGroup.videos.length}개 · 조회수순</p>
            </div>
            <button
              onClick={() => setSelectedGroup(null)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition text-sm"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedGroup.videos.map((v) => (
              <div
                key={`${v.videoId}:${v.lat}:${v.lng}`}
                className={`flex gap-3 px-3 py-3.5 transition border-b border-border last:border-0 group ${
                  selectedVideo?.videoId === v.videoId
                    ? 'border-l-4 border-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                {/* Thumbnail — click to play */}
                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={() => setSelectedVideo(v)}
                >
                  <img src={v.thumbnail} alt="" className="w-28 h-[68px] object-cover rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center shadow-sm">
                      <div className="w-0 h-0 border-y-[7px] border-y-transparent border-l-[13px] border-l-white ml-1" />
                    </div>
                  </div>
                  <DurationBadge duration={v.duration} isShort={v.isShort} className="bottom-1 right-1" />
                </div>

                {/* Info */}
                <div className="flex-1 overflow-hidden min-w-0">
                  <p
                    className="text-xs font-medium line-clamp-2 leading-snug cursor-pointer hover:text-blue-600"
                    onClick={() => setSelectedVideo(v)}
                  >
                    {decodeHtmlEntities(v.title)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {v.placeName && (
                      <p className="text-sm font-semibold text-gray-800 truncate">📍 {v.placeName}</p>
                    )}
                    <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                      {v.distanceKm}km
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {v.subscriberTier && <TierButton tier={v.subscriberTier} />} {v.channel}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatViews(v.viewCount)}
                    {v.source === 'ai' && <span className="ml-1 text-purple-400">AI</span>}
                  </p>
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
                      favorited={favoriteIds.has(v.videoId)}
                      visited={visitedIds.has(v.videoId)}
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

      {/* Video player modal — single-video marker only (multi-video uses compact player above) */}
      {!selectedGroup && selectedVideo && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg md:max-w-2xl mx-4 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerFrame video={selectedVideo} portraitMaxVh={65} />
            <div className="flex items-start justify-between p-3 gap-3">
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold line-clamp-2">{decodeHtmlEntities(selectedVideo.title)}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {selectedVideo.placeName && (
                    <p className="text-base font-bold text-gray-800">📍 {selectedVideo.placeName}</p>
                  )}
                  <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                    현재 위치에서 {selectedVideo.distanceKm}km
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedVideo.subscriberTier && <TierButton tier={selectedVideo.subscriberTier} />} {selectedVideo.channel} · {formatViews(selectedVideo.viewCount)}
                  {selectedVideo.duration && <> · {selectedVideo.duration}</>}
                  <span className="ml-1">{selectedVideo.isShort ? '📱' : '🎬'}</span>
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <a
                  href={navUrl(selectedVideo, userPos ? { ...userPos, label: posLabel } : null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="길찾기"
                >
                  <NaviIcon className="w-8 h-8" />
                </a>
                <VideoActionRow
                  favorited={favoriteIds.has(selectedVideo.videoId)}
                  visited={visitedIds.has(selectedVideo.videoId)}
                  reported={reportedIds.has(selectedVideo.videoId)}
                  onToggleFavorite={() => handleToggleFavorite(selectedVideo)}
                  onToggleVisited={() => handleToggleVisitedVideo(selectedVideo)}
                  onShare={() => handleShare(selectedVideo)}
                  onReport={() => handleReport(selectedVideo)}
                  onHide={() => handleHideVideo(selectedVideo)}
                />
              </div>
            </div>
            <button
              onClick={() => setSelectedVideo(null)}
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
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
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
                className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-black text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition disabled:opacity-40"
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
