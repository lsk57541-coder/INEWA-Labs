'use client'

import { useEffect, useRef, useState } from 'react'

// 카카오 장소 검색 결과(한 건). /api/geocode?list=1 응답 형태와 동일.
export interface PlaceSearchResult {
  lat: number
  lng: number
  name: string
  address: string
  category?: string
  phone?: string
}

// 상호명/주소로 카카오 장소를 검색해 선택하는 모달.
// ExtractPlacesForm의 검색 모달(openSearchModal/runSearch/selectPlace)과 동일한 UX·엔드포인트를
// 재사용 가능한 형태로 추출한 것. 선택 시 onSelect(결과)로 좌표·주소·카테고리를 넘긴다.
export default function PlaceSearchModal({
  initialQuery,
  onSelect,
  onClose,
}: {
  initialQuery: string
  onSelect: (result: PlaceSearchResult) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runSearch = async (q: string) => {
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    setResults([])
    try {
      // 음식점/카페/숙박 우선 검색 → 없으면 전체 재검색(ExtractPlacesForm과 동일 폴백).
      const res1 = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}&list=1&category_group_code=FD6,CE7,AD5`)
      const json1 = (await res1.json()) as { results?: PlaceSearchResult[] }
      const r1 = json1.results ?? []
      if (r1.length > 0) {
        setResults(r1)
        setSearching(false)
        return
      }
      const res2 = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}&list=1`)
      const json2 = (await res2.json()) as { results?: PlaceSearchResult[] }
      const r2 = json2.results ?? []
      setResults(r2)
      setError(r2.length === 0 ? '검색 결과가 없습니다' : null)
      setSearching(false)
    } catch {
      setError('검색 실패')
      setSearching(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-lg w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <p className="text-sm font-medium">장소 검색</p>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none transition"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 p-4 border-b shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
            placeholder="상호명 또는 주소 입력"
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => runSearch(query)}
            disabled={searching || !query.trim()}
            className="shrink-0 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {searching ? '검색 중…' : '검색'}
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {error && <p className="text-sm text-gray-500 text-center py-10">{error}</p>}
          {!searching && !error && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">검색어를 입력하고 검색 버튼을 눌러주세요</p>
          )}
          {results.map((result, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(result)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 transition"
            >
              <p className="text-sm font-medium text-gray-900">{result.name}</p>
              {result.category && (
                <p className="text-xs text-blue-600 mt-0.5">{result.category.split('>').pop()?.trim()}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">{result.address}</p>
              {result.phone && <p className="text-xs text-gray-400 mt-0.5">{result.phone}</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
