'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { bulkAddLocations } from '@/app/actions'

interface VideoInfo {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  publishedAt: string
}

interface PlaceRow {
  id: string
  name: string
  address: string
  category: string
  timestampInput: string
  lat: number | null
  lng: number | null
  geocoding: boolean
  geocodeError: string | null
}

interface PlaceSearchResult {
  name: string
  address: string
  category?: string
  phone?: string
  lat: number
  lng: number
}

interface SearchModal {
  rowIdx: number
  query: string
  results: PlaceSearchResult[]
  searching: boolean
  error: string | null
}

function makeRow(): PlaceRow {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    address: '',
    category: '',
    timestampInput: '',
    lat: null,
    lng: null,
    geocoding: false,
    geocodeError: null,
  }
}

function parseTimestamp(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const colonMatch = trimmed.match(/^(\d+):(\d{2})$/)
  if (colonMatch) return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10)
  const n = parseInt(trimmed, 10)
  return isNaN(n) ? undefined : n
}

export default function BulkLocationForm() {
  const router = useRouter()
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [videoFetching, setVideoFetching] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)

  const [places, setPlaces] = useState<PlaceRow[]>([makeRow()])
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ succeeded: number; errors: string[] } | null>(null)

  const [modal, setModal] = useState<SearchModal | null>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (modal) modalInputRef.current?.focus()
  }, [modal?.rowIdx])

  const fetchVideo = useCallback(async () => {
    if (!videoUrl.trim()) return
    setVideoFetching(true)
    setVideoError(null)
    setVideoInfo(null)
    try {
      const res = await fetch(`/api/admin/video-info?url=${encodeURIComponent(videoUrl.trim())}`)
      const data = await res.json() as VideoInfo & { error?: string }
      if (!res.ok) { setVideoError(data.error ?? '영상 조회 실패'); return }
      setVideoInfo(data)
    } catch {
      setVideoError('네트워크 오류')
    } finally {
      setVideoFetching(false)
    }
  }, [videoUrl])

  const geocodeAddress = useCallback(async (idx: number) => {
    setPlaces(prev => {
      const row = prev[idx]
      if (!row.address.trim() || row.lat !== null) return prev
      return prev.map((r, i) => i === idx ? { ...r, geocoding: true, geocodeError: null } : r)
    })
    setPlaces(prev => {
      const row = prev[idx]
      if (!row.address.trim() || row.geocoding === false) return prev
      return prev
    })

    const currentRow = places[idx]
    if (!currentRow.address.trim() || currentRow.lat !== null) return

    setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, geocoding: true, geocodeError: null } : r))
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(currentRow.address.trim())}&list=1`)
      const json = await res.json() as { results?: PlaceSearchResult[] }
      const first = json.results?.[0]
      if (first) {
        setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, lat: first.lat, lng: first.lng, geocoding: false } : r))
      } else {
        setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, geocoding: false, geocodeError: '주소를 찾을 수 없습니다' } : r))
      }
    } catch {
      setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, geocoding: false, geocodeError: '좌표 변환 실패' } : r))
    }
  }, [places])

  const updateRow = useCallback((idx: number, patch: Partial<PlaceRow>) => {
    setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }, [])

  const removeRow = useCallback((idx: number) => {
    setPlaces(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const openSearchModal = useCallback((idx: number) => {
    setModal({ rowIdx: idx, query: places[idx].name, results: [], searching: false, error: null })
  }, [places])

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) return
    setModal(prev => prev ? { ...prev, searching: true, error: null, results: [] } : null)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&list=1`)
      const json = await res.json() as { results?: PlaceSearchResult[] }
      setModal(prev => prev ? {
        ...prev,
        searching: false,
        results: json.results ?? [],
        error: (json.results?.length ?? 0) === 0 ? '검색 결과가 없습니다' : null,
      } : null)
    } catch {
      setModal(prev => prev ? { ...prev, searching: false, error: '검색 실패' } : null)
    }
  }, [])

  const selectPlace = useCallback((result: PlaceSearchResult) => {
    if (!modal) return
    setPlaces(prev => prev.map((r, i) => i === modal.rowIdx ? {
      ...r,
      name: result.name,
      address: result.address,
      category: result.category ? result.category.split('>').pop()?.trim() ?? result.category : r.category,
      lat: result.lat,
      lng: result.lng,
      geocodeError: null,
    } : r))
    setModal(null)
  }, [modal])

  const handleSubmit = async () => {
    if (!videoInfo) return

    const needGeocode = places.filter(r => r.address.trim() && r.lat === null)
    if (needGeocode.length > 0) {
      await Promise.all(places.map((_, i) => geocodeAddress(i)))
      return
    }

    const valid = places.filter(r => r.name.trim() && r.lat !== null && r.lng !== null)
    if (valid.length === 0) {
      alert('장소명과 주소(좌표)를 모두 입력해주세요')
      return
    }

    setSaving(true)
    setSaveResult(null)
    try {
      const result = await bulkAddLocations(
        {
          youtube_id: videoInfo.videoId,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          channel: videoInfo.channel,
          published_at: videoInfo.publishedAt,
        },
        valid.map(r => ({
          name: r.name.trim(),
          address: r.address.trim(),
          category: r.category.trim() || undefined,
          lat: r.lat!,
          lng: r.lng!,
          timestamp_sec: parseTimestamp(r.timestampInput),
        }))
      )
      setSaveResult(result)
      if (result.errors.length === 0) {
        router.push('/admin')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* YouTube URL */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">YouTube 영상 URL</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={videoUrl}
              onChange={e => { setVideoUrl(e.target.value); setVideoInfo(null); setVideoError(null) }}
              onKeyDown={e => e.key === 'Enter' && fetchVideo()}
              placeholder="https://www.youtube.com/watch?v=... 또는 https://youtu.be/..."
              className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchVideo}
              disabled={videoFetching || !videoUrl.trim()}
              className="shrink-0 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {videoFetching ? '조회 중…' : '조회'}
            </button>
          </div>
          {videoError && <p className="text-xs text-red-500">{videoError}</p>}

          {videoInfo && (
            <div className="flex gap-3 items-start bg-gray-50 rounded-lg p-3">
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                className="w-24 h-14 object-cover rounded shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium line-clamp-2">{videoInfo.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{videoInfo.channel}</p>
              </div>
            </div>
          )}
        </div>

        {/* Place rows */}
        {videoInfo && (
          <div className="space-y-3">
            <p className="text-sm font-medium">장소 목록</p>

            {places.map((row, idx) => (
              <div key={row.id} className="border rounded-lg p-4 space-y-3">
                {/* Name + search button */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => updateRow(idx, { name: e.target.value })}
                    placeholder="장소명"
                    className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => openSearchModal(idx)}
                    className="shrink-0 text-sm border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition"
                    title="장소 검색"
                  >
                    검색
                  </button>
                  {places.length > 1 && (
                    <button
                      onClick={() => removeRow(idx)}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-500 px-2 transition"
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Address */}
                <div className="relative">
                  <input
                    type="text"
                    value={row.address}
                    onChange={e => updateRow(idx, { address: e.target.value, lat: null, lng: null, geocodeError: null })}
                    onBlur={() => geocodeAddress(idx)}
                    placeholder="주소 (입력 후 포커스 이동 시 자동 좌표 변환)"
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {row.geocoding && (
                    <span className="absolute right-3 top-2.5 text-xs text-gray-400">변환 중…</span>
                  )}
                </div>

                {row.geocodeError && <p className="text-xs text-red-500">{row.geocodeError}</p>}
                {row.lat !== null && row.lng !== null && (
                  <p className="text-xs text-gray-400">{row.lat.toFixed(5)}, {row.lng.toFixed(5)}</p>
                )}

                {/* Category + timestamp */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={row.category}
                    onChange={e => updateRow(idx, { category: e.target.value })}
                    placeholder="카테고리 (예: 음식점, 카페)"
                    className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={row.timestampInput}
                    onChange={e => updateRow(idx, { timestampInput: e.target.value })}
                    placeholder="등장시간 (mm:ss)"
                    className="w-28 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}

            <button
              onClick={() => setPlaces(prev => [...prev, makeRow()])}
              className="w-full text-sm border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 rounded-lg py-3 transition"
            >
              + 장소 추가
            </button>
          </div>
        )}

        {/* Save result errors */}
        {saveResult && saveResult.errors.length > 0 && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-1">
            {saveResult.succeeded > 0 && (
              <p className="text-sm text-green-700">{saveResult.succeeded}개 저장 완료</p>
            )}
            {saveResult.errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600">{e}</p>
            ))}
          </div>
        )}

        {/* Submit */}
        {videoInfo && (
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {saving ? '저장 중…' : `일괄 저장 (${places.filter(r => r.name.trim()).length}개)`}
            </button>
          </div>
        )}
      </div>

      {/* Place search modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div className="bg-white rounded-lg w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="text-sm font-medium">장소 검색</p>
              <button
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none transition"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {/* Search input */}
            <div className="flex gap-2 p-4 border-b shrink-0">
              <input
                ref={modalInputRef}
                type="text"
                value={modal.query}
                onChange={e => setModal(prev => prev ? { ...prev, query: e.target.value, error: null } : null)}
                onKeyDown={e => e.key === 'Enter' && runSearch(modal.query)}
                placeholder="상호명 또는 주소 입력"
                className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => runSearch(modal.query)}
                disabled={modal.searching || !modal.query.trim()}
                className="shrink-0 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {modal.searching ? '검색 중…' : '검색'}
              </button>
            </div>

            {/* Results */}
            <div className="overflow-y-auto flex-1">
              {modal.error && (
                <p className="text-sm text-gray-500 text-center py-10">{modal.error}</p>
              )}

              {!modal.searching && !modal.error && modal.results.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">
                  검색어를 입력하고 검색 버튼을 눌러주세요
                </p>
              )}

              {modal.results.map((result, i) => (
                <button
                  key={i}
                  onClick={() => selectPlace(result)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 transition"
                >
                  <p className="text-sm font-medium text-gray-900">{result.name}</p>
                  {result.category && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      {result.category.split('>').pop()?.trim()}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">{result.address}</p>
                  {result.phone && (
                    <p className="text-xs text-gray-400 mt-0.5">{result.phone}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
