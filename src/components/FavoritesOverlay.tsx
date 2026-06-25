'use client'

import { useEffect, useState } from 'react'
import { getFavorites, getVisited, getPlaceDetails, type FavoriteVideo } from '@/app/actions'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

interface PlaceDetails {
  name: string
  category: string
  address: string
  phone?: string
}

type Tab = 'all' | 'favorited' | 'visited'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'favorited', label: '찜한 목록' },
  { key: 'visited', label: '가본 목록' },
]

interface FavoritesOverlayProps {
  open: boolean
  onClose: () => void
  favoriteIds: Set<string>
  visitedIds: Set<string>
  onToggleFavorite: (v: FavoriteVideo) => void
  onToggleVisited: (v: FavoriteVideo) => void
  onJumpToPlace?: (lat: number, lng: number, videoId: string) => void
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CheckCircleIcon({ checked }: { checked: boolean }) {
  return checked ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" stroke="white" fill="none" strokeWidth="2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function looksLikeAddress(s: string): boolean {
  // 숫자 + 도로명/행정구역 키워드가 함께 있으면 주소로 판단
  return /\d/.test(s) && /[로길동구시군읍면리]/.test(s)
}

function resolvePlaceName(
  kakaoName: string | undefined,
  placeName: string | undefined,
  channel: string | undefined
): string {
  if (kakaoName) return kakaoName
  if (placeName && !looksLikeAddress(placeName)) return placeName
  if (channel) return channel
  return '이름 없는 장소'
}

export default function FavoritesOverlay({
  open,
  onClose,
  favoriteIds,
  visitedIds,
  onToggleFavorite,
  onToggleVisited,
  onJumpToPlace,
}: FavoritesOverlayProps) {
  const [tab, setTab] = useState<Tab>('all')
  const [items, setItems] = useState<FavoriteVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState<Record<string, PlaceDetails | null>>({})

  useEffect(() => {
    if (!open) return
    async function load() {
      setLoading(true)
      try {
        const [favs, visited] = await Promise.all([getFavorites(), getVisited()])
        const byId = new Map<string, FavoriteVideo>()
        for (const v of [...favs, ...visited]) byId.set(v.video_id, v)
        setItems(Array.from(byId.values()))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open])

  useEffect(() => {
    if (!open) return
    for (const v of items) {
      if (v.video_id in details) continue
      getPlaceDetails(v.title, v.lat, v.lng)
        .then((d) => setDetails((prev) => ({ ...prev, [v.video_id]: d })))
        .catch(() => setDetails((prev) => ({ ...prev, [v.video_id]: null })))
    }
  }, [open, items, details])

  if (!open) return null

  const filtered = items.filter((v) => {
    if (tab === 'favorited') return favoriteIds.has(v.video_id)
    if (tab === 'visited') return visitedIds.has(v.video_id)
    return favoriteIds.has(v.video_id) || visitedIds.has(v.video_id)
  })

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <button onClick={onClose} className="text-2xl text-gray-600 px-1">‹</button>
        <span className="font-bold">관심 목록</span>
      </div>

      {/* 언더라인 탭 */}
      <div className="flex border-b shrink-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              tab === key
                ? 'border-black text-black'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading && <p className="text-center text-sm text-gray-400 py-10">불러오는 중…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">목록이 비어있습니다.</p>
        )}
        {filtered.map((v) => {
          const d = details[v.video_id]        // undefined = 로딩 중, null = 조회 실패
          const isLoading = !(v.video_id in details)
          const placeName = resolvePlaceName(d?.name, v.place_name, v.channel)
          return (
            <div key={v.video_id} className="mx-3 mb-3 rounded-xl border bg-white shadow-sm overflow-hidden">
              {/* 카드 본문 — 클릭 시 지도로 이동 */}
              <button
                className="flex items-start gap-3 w-full p-3 text-left hover:bg-gray-50 transition"
                onClick={() => {
                  onJumpToPlace?.(v.lat, v.lng, v.video_id)
                  onClose()
                }}
              >
                <div className="w-20 h-12 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  {isLoading ? (
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-2/3 bg-gray-100 rounded animate-pulse" />
                      <div className="h-2.5 w-full bg-gray-100 rounded animate-pulse" />
                    </div>
                  ) : (
                    <>
                      {/* 장소명 + 카테고리 뱃지 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold leading-snug">{placeName}</p>
                        {d?.category && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium shrink-0">
                            {d.category.split(' > ').at(-1)}
                          </span>
                        )}
                      </div>
                      {/* 주소 */}
                      {d?.address && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-1">{d.address}</p>
                      )}
                    </>
                  )}
                </div>
              </button>

              {/* 액션 버튼 영역 */}
              <div className="border-t bg-gray-50 px-3 pt-2 pb-2">
                {/* 영상 제목 */}
                <p className="text-xs text-gray-400 truncate mb-2 leading-tight">
                  {decodeHtmlEntities(v.title)}
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => onToggleFavorite(v)}
                    title={favoriteIds.has(v.video_id) ? '찜 취소' : '찜하기'}
                    className="text-gray-300 hover:text-amber-400 transition-colors duration-150"
                  >
                    <HeartIcon filled={favoriteIds.has(v.video_id)} />
                  </button>
                  <button
                    onClick={() => onToggleVisited(v)}
                    title={visitedIds.has(v.video_id) ? '방문 취소' : '가봤어요'}
                    className="text-gray-300 hover:text-green-500 transition-colors duration-150"
                  >
                    <CheckCircleIcon checked={visitedIds.has(v.video_id)} />
                  </button>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition"
                    onClick={(e) => e.stopPropagation()}
                  >
                    영상 보기 →
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
