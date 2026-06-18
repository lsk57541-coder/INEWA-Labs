'use client'

import { useEffect, useState } from 'react'
import { getFavorites, getVisited, getPlaceDetails, type FavoriteVideo } from '@/app/actions'

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
}

export default function FavoritesOverlay({
  open,
  onClose,
  favoriteIds,
  visitedIds,
  onToggleFavorite,
  onToggleVisited,
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
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <button onClick={onClose} className="text-2xl text-gray-600 px-1">‹</button>
        <span className="font-bold">관심 목록</span>
      </div>

      <div className="flex gap-2 px-4 py-3 border-b shrink-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
              tab === key
                ? 'bg-red-50 text-red-500 border-red-300'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="text-center text-sm text-gray-400 py-10">불러오는 중…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">목록이 비어있습니다.</p>
        )}
        {filtered.map((v) => {
          const d = details[v.video_id]
          return (
            <div key={v.video_id} className="flex items-start gap-3 px-4 py-3 border-b last:border-0">
              <a
                href={`https://www.youtube.com/watch?v=${v.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 flex-1 min-w-0 hover:opacity-80 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt="" className="w-20 h-12 object-cover rounded-lg shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 line-clamp-1 leading-tight">{v.title}</p>
                  <p className="text-base font-bold mt-1 leading-snug">
                    {d?.name || v.place_name || v.channel}
                    {d?.category && <span className="text-gray-400 font-normal text-sm"> {d.category}</span>}
                  </p>
                  {d?.address && <p className="text-sm text-gray-500 mt-1 leading-snug">{d.address}</p>}
                  {d?.phone && <p className="text-sm text-gray-500 leading-snug">{d.phone}</p>}
                </div>
              </a>
              <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                <button
                  onClick={() => onToggleFavorite(v)}
                  title="찜하기"
                  className={`text-xl leading-none transition ${
                    favoriteIds.has(v.video_id) ? 'text-red-500' : 'text-gray-300 hover:text-red-400'
                  }`}
                >
                  {favoriteIds.has(v.video_id) ? '♥' : '♡'}
                </button>
                <button
                  onClick={() => onToggleVisited(v)}
                  title="가본 곳으로 표시"
                  className={`text-lg leading-none transition ${
                    visitedIds.has(v.video_id) ? 'text-gray-600' : 'text-gray-300 hover:text-gray-400'
                  }`}
                >
                  {visitedIds.has(v.video_id) ? '⚑' : '⚐'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
