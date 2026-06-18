'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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
} from '@/app/actions'
import MenuDrawer, { type MenuUser } from '@/components/MenuDrawer'
import FavoritesOverlay from '@/components/FavoritesOverlay'

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'wrong_address', label: '주소가 정확하지 않아요' },
  { key: 'unrelated', label: '전혀 상관없는 영상이에요' },
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

function groupByLocation(videos: VideoResult[], thresholdKm = 0.08): MarkerGroup[] {
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

function formatViews(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억회`
  if (n >= 10_000) return `${Math.floor(n / 10_000)}만회`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}천회`
  return `${n}회`
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

interface VideoActionRowProps {
  favorited: boolean
  visited: boolean
  reported: boolean
  onToggleFavorite: () => void
  onToggleVisited: () => void
  onShare: () => void
  onReport: () => void
}

function VideoActionRow({
  favorited,
  visited,
  reported,
  onToggleFavorite,
  onToggleVisited,
  onShare,
  onReport,
}: VideoActionRowProps) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={onToggleFavorite}
        title="찜하기"
        className={`text-xl leading-none transition ${favorited ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}
      >
        {favorited ? '♥' : '♡'}
      </button>
      <button
        onClick={onToggleVisited}
        title="가본 곳으로 표시"
        className={`text-lg leading-none transition ${visited ? 'text-gray-600' : 'text-gray-300 hover:text-gray-500'}`}
      >
        {visited ? '⚑' : '⚐'}
      </button>
      <button onClick={onShare} title="카카오톡 공유" className="text-base leading-none text-gray-400 hover:text-yellow-500 transition">
        🔗
      </button>
      <button
        onClick={onReport}
        title={reported ? '신고 취소' : '위치 오류 신고'}
        className={`text-base leading-none transition ${reported ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
      >
        {reported ? '🚩' : '⚠'}
      </button>
    </div>
  )
}

export default function SearchMap({ user }: { user: MenuUser | null }) {
  const [keyword, setKeyword] = useState('')
  const [radius, setRadius] = useState<Radius>(1)
  const [searchMode, setSearchMode] = useState<'keyword' | 'channel'>('keyword')
  const [panelOpen, setPanelOpen] = useState(true)
  const [listOpen, setListOpen] = useState(true)
  const [panelOpacity, setPanelOpacity] = useState(0.95)
  const [addressInput, setAddressInput] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([])
  const locationSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posLabel, setPosLabel] = useState<string>('위치 미설정')
  const [allResults, setAllResults] = useState<VideoResult[]>([])
  const [videoFilter, setVideoFilter] = useState<'all' | 'short' | 'long'>('all')
  const [sortBy, setSortBy] = useState<'views' | 'duration' | 'distance'>('views')
  const [channelQuery, setChannelQuery] = useState('')
  const [channelSuggestions, setChannelSuggestions] = useState<ChannelSuggestion[]>([])
  const [channelSearching, setChannelSearching] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<ChannelSuggestion | null>(null)
  const channelSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<MarkerGroup | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<VideoResult | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [favoritesOverlayOpen, setFavoritesOverlayOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<VideoResult | null>(null)
  const [reportReason, setReportReason] = useState<ReportReason>('wrong_address')
  const [reportAddress, setReportAddress] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportResult, setReportResult] = useState<string | null>(null)
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [addressSearching, setAddressSearching] = useState(false)
  const addressSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetDragStartY = useRef<number | null>(null)

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

  const panTo = useCallback(
    (lat: number, lng: number) => {
      if (!mapInstanceRef.current) return
      mapInstanceRef.current.setCenter(new kakao.maps.LatLng(lat, lng))
      const levelMap: Record<number, number> = { 1: 4, 3: 6, 5: 7, 10: 8 }
      mapInstanceRef.current.setLevel(levelMap[radius] ?? 7)
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
        setError(null)
        panTo(latitude, longitude)
      },
      () => setError('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.')
    )
  }

  const fetchLocationSuggestions = async (value: string) => {
    setAddressLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}&list=1`)
      const json = await res.json() as { results?: AddressSuggestion[] }
      setLocationSuggestions(json.results ?? [])
      if (!json.results || json.results.length === 0) setError('일치하는 주소를 찾을 수 없습니다.')
    } catch {
      setLocationSuggestions([])
      setError('주소 검색 실패')
    } finally {
      setAddressLoading(false)
    }
  }

  const handleAddressInputChange = (value: string) => {
    setAddressInput(value)
    if (locationSearchTimer.current) clearTimeout(locationSearchTimer.current)
    if (!value.trim()) { setLocationSuggestions([]); return }
    locationSearchTimer.current = setTimeout(() => fetchLocationSuggestions(value.trim()), 350)
  }

  const handleAddressSearch = () => {
    if (!addressInput.trim()) { setError('주소를 입력해주세요.'); return }
    fetchLocationSuggestions(addressInput.trim())
  }

  const selectLocationSuggestion = (s: AddressSuggestion) => {
    setUserPos({ lat: s.lat, lng: s.lng })
    setPosLabel(s.name)
    panTo(s.lat, s.lng)
    setAddressInput(s.name)
    setLocationSuggestions([])
  }

  const renderMarkers = useCallback(
    (groups: MarkerGroup[], center: { lat: number; lng: number }, favIds: Set<string>, visitedIdSet: Set<string>) => {
      if (!mapInstanceRef.current) return
      lastCenterRef.current = center

      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      overlaysRef.current.forEach((o) => o.setMap(null))
      overlaysRef.current = []
      if (circleRef.current) circleRef.current.setMap(null)

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

      groups.forEach((group) => {
        const pos = new kakao.maps.LatLng(group.lat, group.lng)
        const isFavorite = group.videos.some((v) => favIds.has(v.videoId))
        const isVisited = group.videos.some((v) => visitedIdSet.has(v.videoId))
        const marker = new kakao.maps.Marker({
          position: pos,
          map: mapInstanceRef.current!,
          image: groupMarkerImage(group.videos, isFavorite, isVisited),
        })
        kakao.maps.event.addListener(marker, 'click', () => setSelectedGroup(group))
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

      mapInstanceRef.current.setCenter(new kakao.maps.LatLng(center.lat, center.lng))
      const levelMap: Record<number, number> = { 1: 4, 3: 6, 5: 7, 10: 8 }
      mapInstanceRef.current.setLevel(levelMap[radius] ?? 7)
    },
    [radius]
  )

  const handleSearch = async () => {
    if (searchMode === 'keyword' && !keyword.trim()) { setError('검색어를 입력해주세요.'); return }
    if (searchMode === 'channel' && !selectedChannel) { setError('유튜브 채널을 선택해주세요.'); return }
    if (!userPos) { setError('위치를 먼저 설정해주세요.'); return }

    setLoading(true)
    setError(null)
    setAllResults([])
    setSelectedGroup(null)
    setSelectedVideo(null)

    try {
      const params = new URLSearchParams({
        lat: String(userPos.lat),
        lng: String(userPos.lng),
        radius: String(radius),
      })
      if (searchMode === 'keyword') params.set('q', keyword)
      else if (selectedChannel) params.set('channelId', selectedChannel.channelId)
      const res = await fetch(`/api/search?${params}`)
      const json = await res.json() as { results?: VideoResult[]; error?: string }

      if (!res.ok) throw new Error(json.error ?? '검색 실패')

      const videos = json.results ?? []
      setAllResults(videos)
      setVideoFilter('all')
      renderMarkers(groupByLocation(videos), userPos, favoriteIds, visitedIds)

      // Markers on the map take priority, then the results sheet — keep the
      // search panel out of the way and the results collapsed to a peek.
      setPanelOpen(false)
      setListOpen(false)

      if (videos.length === 0) setError('해당 반경 내에 검색 결과가 없습니다.')
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
    setFavoriteIds(next)
    if (lastCenterRef.current) renderMarkers(groupByLocation(allResults), lastCenterRef.current, next, visitedIds)

    try {
      await toggleFavorite(toFavoritePayload(v))
    } catch (e) {
      setFavoriteIds(favoriteIds)
      if (lastCenterRef.current) renderMarkers(groupByLocation(allResults), lastCenterRef.current, favoriteIds, visitedIds)
      setError(e instanceof Error ? e.message : '찜하기 실패')
    }
  }

  const handleToggleVisitedVideo = async (v: VideoResult) => {
    if (!user) { setError('로그인이 필요합니다.'); return }
    const wasVisited = visitedIds.has(v.videoId)
    const next = new Set(visitedIds)
    if (wasVisited) next.delete(v.videoId)
    else next.add(v.videoId)
    setVisitedIds(next)
    if (lastCenterRef.current) renderMarkers(groupByLocation(allResults), lastCenterRef.current, favoriteIds, next)

    try {
      await toggleVisited(toFavoritePayload(v))
    } catch (e) {
      setVisitedIds(visitedIds)
      if (lastCenterRef.current) renderMarkers(groupByLocation(allResults), lastCenterRef.current, favoriteIds, visitedIds)
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

  const handleReportAddressChange = (value: string) => {
    setReportAddress(value)
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

  const handleChannelQueryChange = (value: string) => {
    setChannelQuery(value)
    if (channelSearchTimer.current) clearTimeout(channelSearchTimer.current)
    if (!value.trim()) { setChannelSuggestions([]); return }
    channelSearchTimer.current = setTimeout(async () => {
      setChannelSearching(true)
      try {
        const res = await fetch(`/api/channel-search?q=${encodeURIComponent(value.trim())}`)
        const json = await res.json() as { results?: ChannelSuggestion[] }
        setChannelSuggestions(json.results ?? [])
      } catch {
        setChannelSuggestions([])
      } finally {
        setChannelSearching(false)
      }
    }, 350)
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
    setReportAddress('')
    setReportResult(null)
    setAddressSuggestions([])
  }

  const handleSubmitReport = async () => {
    if (!reportTarget) return
    setReportSubmitting(true)
    setReportResult(null)
    try {
      const res = await submitReport(reportTarget.videoId, reportTarget.lat, reportTarget.lng, reportReason, reportAddress)
      setReportedIds((prev) => new Set(prev).add(reportTarget.videoId))
      if (reportReason === 'wrong_address') {
        if (res.corrected && res.address) {
          setReportResult(`카카오맵에서 확인했습니다: "${res.address}" — 이 영상의 위치가 업데이트됩니다.`)
          const corrected = { ...reportTarget, placeName: res.address }
          setAllResults((prev) => prev.map((r) => (r.videoId === reportTarget.videoId ? corrected : r)))
        } else {
          setReportResult('카카오맵에서 해당 주소를 찾지 못했습니다. 주소를 다시 확인해주세요.')
          return
        }
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

  const filteredResults = allResults
    .filter((v) => {
      if (videoFilter === 'short') return v.isShort
      if (videoFilter === 'long') return !v.isShort
      return true
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'distance') return a.distanceKm - b.distanceKm
      if (sortBy === 'duration') return parseDurationLabel(b.duration) - parseDurationLabel(a.duration)
      return b.viewCount - a.viewCount
    })

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false&libraries=drawing`}
        onLoad={initMap}
      />
      <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" />

      {/* Map */}
      <div ref={mapRef} className="flex-1 h-full" />

      {/* Locate-me button */}
      <button
        onClick={getLocation}
        title="현재 위치로 이동"
        className="absolute bottom-6 left-3 z-20 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-lg hover:bg-gray-50 transition"
      >
        🎯
      </button>

      {/* Hamburger menu */}
      <button
        onClick={() => setMenuOpen(true)}
        className="absolute top-3 left-3 z-20 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-lg hover:bg-gray-50 transition"
      >
        ☰
      </button>
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        onShowFavorites={handleShowFavorites}
      />
      <FavoritesOverlay
        open={favoritesOverlayOpen}
        onClose={() => setFavoritesOverlayOpen(false)}
        favoriteIds={favoriteIds}
        visitedIds={visitedIds}
        onToggleFavorite={handleToggleFavoriteById}
        onToggleVisited={handleToggleVisited}
      />

      {/* Search panel — left overlay */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-16 left-3 z-10 bg-white shadow-lg rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-gray-50 transition"
        >
          🔍 검색창 열기
        </button>
      )}

      <div
        className={`absolute top-16 left-3 z-10 w-72 rounded-xl shadow-lg overflow-hidden ${panelOpen ? '' : 'hidden'}`}
        style={{ backgroundColor: `rgba(255,255,255,${panelOpacity})` }}
      >
        {/* Panel header — collapse + opacity control */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-bold text-gray-700">AI맵튜브 검색</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">투명도</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={panelOpacity}
              onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
              className="w-14 accent-blue-600"
              title="검색창 투명도"
            />
            <button
              onClick={() => setPanelOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 shrink-0"
              title="검색창 닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search mode: keyword or channel */}
        <div className="px-3 pt-3 pb-2 border-b">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setSearchMode('keyword')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition ${
                searchMode === 'keyword'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🔎 키워드 검색
            </button>
            <button
              onClick={() => setSearchMode('channel')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition ${
                searchMode === 'channel'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🎙 유튜브 채널 검색
            </button>
          </div>

          {searchMode === 'keyword' ? (
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="키워드 검색 (예: 한강 카페, 제주 맛집)"
              className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
            />
          ) : selectedChannel ? (
            <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-xs font-medium">
              <span className="flex-1 truncate">🎙 {selectedChannel.title} 채널 영상만 검색</span>
              <button
                onClick={() => { setSelectedChannel(null); setChannelQuery('') }}
                className="shrink-0 text-blue-400 hover:text-blue-600"
                title="채널 선택 해제"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={channelQuery}
                onChange={(e) => handleChannelQueryChange(e.target.value)}
                placeholder="유튜버 채널명으로 검색"
                className="w-full text-xs border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
              />
              {channelSearching && <p className="text-xs text-gray-400 mt-1">검색 중…</p>}
              {channelSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {channelSuggestions.map((c) => (
                    <button
                      key={c.channelId}
                      onClick={() => {
                        setSelectedChannel(c)
                        setChannelQuery('')
                        setChannelSuggestions([])
                      }}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 transition"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.thumbnail} alt="" className="w-6 h-6 rounded-full shrink-0" />
                      <p className="text-sm font-medium truncate">{c.title}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search location: direct address input, plus a shortcut back to GPS */}
        <div className="px-3 pt-2 pb-2 border-b">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-400 font-medium">📍 검색위치 직접입력</p>
            <button
              onClick={getLocation}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition"
            >
              🎯 현재 위치로
            </button>
          </div>
          <div className="relative">
            <div className="flex gap-1">
              <input
                type="text"
                value={addressInput}
                onChange={(e) => handleAddressInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                placeholder="지역명 또는 주소 입력"
                className="flex-1 min-w-0 text-xs border rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
              />
              <button
                onClick={handleAddressSearch}
                disabled={addressLoading}
                className="shrink-0 text-xs bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-40 transition"
              >
                {addressLoading ? '…' : '검색'}
              </button>
            </div>
            {locationSuggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {locationSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectLocationSuggestion(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 transition"
                  >
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.address}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {posLabel !== '위치 미설정' && (
            <p className="text-xs text-blue-600 mt-1.5 truncate font-medium">{posLabel}</p>
          )}
        </div>

        {/* Radius */}
        <div className="px-3 pb-2 flex gap-1.5">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`flex-1 text-xs rounded-lg py-1.5 border transition font-medium ${
                radius === r
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>

        {/* Search button */}
        <div className="px-3 pb-3">
          <button
            onClick={handleSearch}
            disabled={loading || !mapReady}
            className="w-full text-sm bg-black text-white rounded-lg py-2 font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {loading ? '검색 중…' : '검색'}
          </button>
        </div>

        {/* Error */}
        {error && <div className="px-3 pb-3 text-xs text-red-500">{error}</div>}
      </div>

      {/* Results list — independent bottom sheet, slides up from the bottom */}
      {allResults.length > 0 && !selectedGroup && (
        <div
          className={`absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 flex flex-col ${
            listOpen ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'
          }`}
          style={{ maxHeight: '50vh' }}
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
              className="w-full flex items-center justify-between px-4 pb-3 text-xs text-gray-500 font-medium border-b"
            >
              <span className="truncate">
                {searchMode === 'channel' && selectedChannel ? `🎙 ${selectedChannel.title}` : `"${keyword}"`} 검색결과 {filteredResults.length}개
              </span>
              <span className="shrink-0 ml-2">{listOpen ? '닫기 ▼' : '열기 ▲'}</span>
            </button>
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-b shrink-0">
            {([['all', '전체'] as const, ['long', null] as const, ['short', null] as const]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setVideoFilter(key)}
                title={key === 'long' ? '롱폼' : key === 'short' ? '쇼츠' : '전체'}
                className={`flex-1 flex items-center justify-center gap-1 text-xs rounded-lg py-1.5 border transition font-medium ${
                  videoFilter === key
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {key === 'long' ? <LongformIcon className="w-5 h-5" /> : key === 'short' ? <ShortsIcon className="w-5 h-5" /> : label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-b shrink-0">
            {([['views', '조회수'], ['duration', '영상길이'], ['distance', '거리(가까운)']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-1 text-xs rounded-lg py-1.5 border transition font-medium ${
                  sortBy === key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredResults.map((v) => (
              <div
                key={v.videoId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition border-b last:border-0"
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
                    {v.title}
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
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video list — bottom sheet capped under half the screen, shown when a map marker is clicked */}
      {selectedGroup && (
        <div
          className="absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: '45vh' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0 rounded-t-2xl">
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
                key={v.videoId}
                className="flex gap-3 p-3 hover:bg-gray-50 transition border-b last:border-0 group"
              >
                {/* Thumbnail — click to play */}
                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={() => setSelectedVideo(v)}
                >
                  <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-white ml-0.5" />
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
                    {v.title}
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
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video player modal */}
      {selectedVideo && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1`}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="flex items-start justify-between p-3 gap-3">
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold line-clamp-2">{selectedVideo.title}</p>
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
              <div className="relative mb-3">
                <input
                  type="text"
                  value={reportAddress}
                  onChange={(e) => handleReportAddressChange(e.target.value)}
                  placeholder="장소명이나 주소를 입력해보세요 (예: 엄마네돼지찌개)"
                  className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900 placeholder-gray-400"
                />
                {addressSearching && (
                  <p className="text-xs text-gray-400 mt-1">검색 중…</p>
                )}
                {addressSuggestions.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {addressSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setReportAddress(s.address)
                          setAddressSuggestions([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 transition"
                      >
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.address}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                disabled={reportSubmitting || (reportReason === 'wrong_address' && !reportAddress.trim())}
                className="flex-1 text-sm bg-black text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition disabled:opacity-40"
              >
                {reportSubmitting ? '제출 중…' : '제출'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
