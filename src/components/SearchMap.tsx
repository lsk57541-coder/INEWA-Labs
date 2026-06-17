'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Script from 'next/script'
import type { VideoResult } from '@/app/api/search/route'
import { haversineKm } from '@/lib/haversine'

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

export default function SearchMap() {
  const [keyword, setKeyword] = useState('')
  const [radius, setRadius] = useState<Radius>(1)
  const [locMode, setLocMode] = useState<'gps' | 'addr'>('gps')
  const [panelOpen, setPanelOpen] = useState(true)
  const [listOpen, setListOpen] = useState(true)
  const [panelOpacity, setPanelOpacity] = useState(0.95)
  const [addressInput, setAddressInput] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posLabel, setPosLabel] = useState<string>('위치 미설정')
  const [allResults, setAllResults] = useState<VideoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<MarkerGroup | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<VideoResult | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null)
  const markersRef = useRef<kakao.maps.Marker[]>([])
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([])
  const circleRef = useRef<kakao.maps.Circle | null>(null)
  const centerOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null)

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

  const handleAddressSearch = async () => {
    if (!addressInput.trim()) { setError('주소를 입력해주세요.'); return }
    setAddressLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(addressInput.trim())}`)
      const json = await res.json() as { lat?: number; lng?: number; name?: string; error?: string }
      if (!res.ok || !json.lat) throw new Error(json.error ?? '주소를 찾을 수 없습니다.')
      setUserPos({ lat: json.lat, lng: json.lng! })
      setPosLabel(json.name ?? addressInput.trim())
      panTo(json.lat, json.lng!)
    } catch (e) {
      setError(e instanceof Error ? e.message : '주소 검색 실패')
    } finally {
      setAddressLoading(false)
    }
  }

  const renderMarkers = useCallback(
    (groups: MarkerGroup[], center: { lat: number; lng: number }) => {
      if (!mapInstanceRef.current) return

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
        const marker = new kakao.maps.Marker({ position: pos, map: mapInstanceRef.current! })
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
    if (!keyword.trim()) { setError('검색어를 입력해주세요.'); return }
    if (!userPos) { setError('위치를 먼저 설정해주세요.'); return }

    setLoading(true)
    setError(null)
    setAllResults([])
    setSelectedGroup(null)
    setSelectedVideo(null)

    try {
      const params = new URLSearchParams({
        q: keyword,
        lat: String(userPos.lat),
        lng: String(userPos.lng),
        radius: String(radius),
      })
      const res = await fetch(`/api/search?${params}`)
      const json = await res.json() as { results?: VideoResult[]; error?: string }

      if (!res.ok) throw new Error(json.error ?? '검색 실패')

      const videos = json.results ?? []
      setAllResults(videos)
      renderMarkers(groupByLocation(videos), userPos)

      if (videos.length === 0) setError('해당 반경 내에 검색 결과가 없습니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false&libraries=drawing`}
        onLoad={initMap}
      />

      {/* Map */}
      <div ref={mapRef} className="flex-1 h-full" />

      {/* Search panel — left overlay */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-3 left-3 z-10 bg-white shadow-lg rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-gray-50 transition"
        >
          🔍 검색창 열기
        </button>
      )}

      <div
        className={`absolute top-3 left-3 z-10 w-72 rounded-xl shadow-lg overflow-hidden ${panelOpen ? '' : 'hidden'}`}
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
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-xs shrink-0"
              title="검색창 닫기"
            >
              ▲
            </button>
          </div>
        </div>

        {/* Location section */}
        <div className="px-3 pt-3 pb-2 border-b">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setLocMode('gps')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition ${
                locMode === 'gps'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📍 현재 위치
            </button>
            <button
              onClick={() => setLocMode('addr')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition ${
                locMode === 'addr'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🔍 주소 입력
            </button>
          </div>

          {locMode === 'gps' ? (
            <button
              onClick={getLocation}
              className="w-full text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-3 py-2 transition font-medium"
            >
              현재 위치 가져오기
            </button>
          ) : (
            <div className="flex gap-1">
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                placeholder="지역명 또는 주소 입력"
                className="flex-1 min-w-0 text-xs border rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={handleAddressSearch}
                disabled={addressLoading}
                className="shrink-0 text-xs bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-40 transition"
              >
                {addressLoading ? '…' : '설정'}
              </button>
            </div>
          )}

          {posLabel !== '위치 미설정' && (
            <p className="text-xs text-blue-600 mt-1.5 truncate font-medium">{posLabel}</p>
          )}
        </div>

        {/* Keyword */}
        <div className="px-3 pt-2 pb-1">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="키워드 검색 (예: 한강 카페, 제주 맛집)"
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
          />
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

        {/* Results list — compact, sorted by view count, collapsible */}
        {allResults.length > 0 && (
          <div className="border-t">
            <button
              onClick={() => setListOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 font-medium border-b hover:bg-gray-50/50 transition"
            >
              <span>{allResults.length}개 · 조회수순</span>
              <span>{listOpen ? '리스트 닫기 ▲' : '리스트 열기 ▼'}</span>
            </button>
            {listOpen && (
            <div className="max-h-56 overflow-y-auto">
            {allResults.map((v) => (
              <div
                key={v.videoId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition border-b last:border-0"
              >
                <img
                  src={v.thumbnail}
                  alt=""
                  className="w-14 h-8 object-cover rounded shrink-0 cursor-pointer"
                  onClick={() => setSelectedVideo(v)}
                />
                <div className="flex-1 overflow-hidden min-w-0">
                  <p
                    className="text-xs font-medium line-clamp-2 leading-tight cursor-pointer hover:text-blue-600"
                    onClick={() => setSelectedVideo(v)}
                  >
                    {v.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400 truncate flex-1">
                      {formatViews(v.viewCount)} · {v.distanceKm}km
                      {v.source === 'ai' && <span className="ml-1 text-purple-400">AI</span>}
                    </p>
                    <a
                      href={navUrl(v, userPos ? { ...userPos, label: locMode === 'gps' ? '현재 위치' : posLabel } : null)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition"
                    >
                      길 찾기
                    </a>
                  </div>
                </div>
              </div>
            ))}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Video list panel — right overlay, shown when a map marker is clicked */}
      {selectedGroup && (
        <div className="absolute top-0 right-0 h-full w-72 bg-white shadow-2xl z-10 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
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
                </div>

                {/* Info */}
                <div className="flex-1 overflow-hidden min-w-0">
                  <p
                    className="text-xs font-medium line-clamp-2 leading-snug cursor-pointer hover:text-blue-600"
                    onClick={() => setSelectedVideo(v)}
                  >
                    {v.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">{v.channel}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatViews(v.viewCount)} · {v.distanceKm}km
                    {v.source === 'ai' && <span className="ml-1 text-purple-400">AI</span>}
                  </p>
                  <a
                    href={navUrl(v, userPos ? { ...userPos, label: locMode === 'gps' ? '현재 위치' : posLabel } : null)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg px-2 py-0.5 font-medium transition"
                  >
                    🗺 길 찾기
                  </a>
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
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedVideo.channel} · {formatViews(selectedVideo.viewCount)} · {selectedVideo.distanceKm}km 이내
                </p>
              </div>
              <a
                href={navUrl(selectedVideo, userPos ? { ...userPos, label: posLabel } : null)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg px-3 py-1.5 font-medium transition"
              >
                🗺 길 찾기
              </a>
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
    </div>
  )
}
