'use client'

import { useState } from 'react'
import { addVideo } from '@/app/actions'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

interface YTVideo {
  youtube_id: string
  title: string
  thumbnail: string
  channel: string
  published_at: string
}

export default function YouTubeSearch({ locationId }: { locationId: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTVideo[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string[]>([])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'YouTube 검색 실패')
      setResults(data.videos)
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 오류')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (video: YTVideo) => {
    setAdding(video.youtube_id)
    try {
      await addVideo(locationId, video)
      setDone((prev) => [...prev, video.youtube_id])
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="YouTube 검색어 입력"
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600 transition disabled:opacity-50"
        >
          {searching ? '검색 중…' : '검색'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((v) => {
            const added = done.includes(v.youtube_id)
            return (
              <li key={v.youtube_id} className="flex items-center gap-3 border rounded-lg p-2">
                <img src={v.thumbnail} alt={decodeHtmlEntities(v.title)} className="w-24 h-14 object-cover rounded shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-medium line-clamp-2">{decodeHtmlEntities(v.title)}</p>
                  <p className="text-xs text-gray-400 truncate">{v.channel}</p>
                </div>
                <button
                  onClick={() => handleAdd(v)}
                  disabled={added || adding === v.youtube_id}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded transition ${
                    added
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-black text-white hover:bg-gray-800 disabled:opacity-50'
                  }`}
                >
                  {added ? '추가됨' : adding === v.youtube_id ? '추가 중…' : '추가'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
