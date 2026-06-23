'use client'

import { useState, useEffect, useCallback } from 'react'
import { bulkRequestPlaces, type BulkPlaceInput } from '@/app/partner/dashboard/places/actions'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

interface ChannelVideo {
  videoId: string
  title: string
  thumbnail: string
  publishedAt: string
}

interface ExtractedPlace {
  name: string
  timestamp_seconds: number | null
}

interface PlaceCard {
  name: string
  address: string
  category: string
  latitude: number | null
  longitude: number | null
  timestamp_seconds: number | null
  included: boolean
  searchResults: KakaoResult[]
  searchOpen: boolean
}

interface KakaoResult {
  name: string
  address: string
  category: string
  lat: number
  lng: number
}

function secondsToMmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    return null
  } catch { return null }
}

export default function ExtractPlacesForm() {
  const [tab, setTab] = useState<'channel' | 'url'>('channel')
  const [videos, setVideos] = useState<ChannelVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [cards, setCards] = useState<PlaceCard[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ succeeded: number; errors: string[] } | null>(null)

  useEffect(() => {
    setVideosLoading(true)
    fetch('/api/partner/channel-videos')
      .then(r => r.json())
      .then((data: { videos?: ChannelVideo[]; error?: string }) => {
        if (data.videos) setVideos(data.videos)
      })
      .finally(() => setVideosLoading(false))
  }, [])

  const runExtract = useCallback(async (url: string) => {
    const videoId = extractVideoId(url)
    if (!videoId) {
      setExtractError('올바른 YouTube URL을 입력해주세요.')
      return
    }
    setExtracting(true)
    setExtractError(null)
    setCards([])

    const res = await fetch(`/api/partner/extract-places?videoId=${videoId}`)
    const data = await res.json() as { places?: ExtractedPlace[]; error?: string }

    if (!res.ok || data.error) {
      setExtractError(data.error ?? '추출 중 오류가 발생했습니다.')
      setExtracting(false)
      return
    }

    const newCards: PlaceCard[] = (data.places ?? []).map(p => ({
      name: p.name,
      address: '',
      category: '',
      latitude: null,
      longitude: null,
      timestamp_seconds: p.timestamp_seconds,
      included: true,
      searchResults: [],
      searchOpen: false,
    }))
    setCards(newCards)
    setExtracting(false)

    // auto-search Kakao for each card
    newCards.forEach((_, idx) => {
      searchKakao(idx, newCards[idx].name, newCards)
    })
  }, [])

  const searchKakao = async (idx: number, name: string, currentCards?: PlaceCard[]) => {
    if (!name.trim()) return
    const base = currentCards ?? cards
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(name)}&list=1&category_group_code=FD6,CE7,AD5`)
    const data = await res.json() as { results?: KakaoResult[] }
    let results = data.results ?? []

    if (results.length === 0) {
      const res2 = await fetch(`/api/geocode?q=${encodeURIComponent(name)}&list=1`)
      const data2 = await res2.json() as { results?: KakaoResult[] }
      results = data2.results ?? []
    }

    setCards(prev => {
      const updated = [...(currentCards ? base : prev)]
      if (updated[idx]) {
        updated[idx] = {
          ...updated[idx],
          searchResults: results.slice(0, 3),
          searchOpen: results.length > 0,
        }
      }
      return updated
    })
  }

  const selectKakao = (cardIdx: number, result: KakaoResult) => {
    setCards(prev => {
      const updated = [...prev]
      updated[cardIdx] = {
        ...updated[cardIdx],
        name: result.name,
        address: result.address,
        category: result.category?.split(' > ').pop() ?? '',
        latitude: result.lat,
        longitude: result.lng,
        searchOpen: false,
      }
      return updated
    })
  }

  const updateCard = (idx: number, patch: Partial<PlaceCard>) => {
    setCards(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], ...patch }
      return updated
    })
  }

  const handleSubmit = async () => {
    const included = cards.filter(c => c.included)
    if (included.length === 0) return
    setSubmitting(true)

    const payload: BulkPlaceInput[] = included.map(c => ({
      name: c.name,
      address: c.address || undefined,
      category: c.category || undefined,
      video_url: videoUrl || undefined,
      latitude: c.latitude ?? undefined,
      longitude: c.longitude ?? undefined,
    }))

    const result = await bulkRequestPlaces(payload)
    setSubmitResult(result)
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted && submitResult) {
    return (
      <div className="text-center py-12">
        <p className="text-2xl mb-2">✓</p>
        <p className="font-medium mb-1">등록 요청이 완료됐습니다.</p>
        <p className="text-sm text-gray-500 mb-1">검토 후 1~2 영업일 내 지도에 표시됩니다.</p>
        {submitResult.succeeded > 0 && (
          <p className="text-xs text-gray-400 mt-1">{submitResult.succeeded}개 요청 완료</p>
        )}
        {submitResult.errors.length > 0 && (
          <p className="text-xs text-red-500 mt-1">{submitResult.errors.length}개 실패</p>
        )}
        <a href="/partner/dashboard/places" className="inline-block mt-6 text-sm text-blue-600 hover:underline">
          장소 목록으로 돌아가기
        </a>
      </div>
    )
  }

  const includedCount = cards.filter(c => c.included).length

  return (
    <div className="space-y-6">
      {/* 탭 */}
      <div className="flex gap-1.5">
        {(['channel', 'url'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
              tab === t ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t === 'channel' ? '내 채널 영상에서 선택' : 'YouTube URL 직접 입력'}
          </button>
        ))}
      </div>

      {/* 탭A: 채널 영상 목록 */}
      {tab === 'channel' && (
        <div>
          {videosLoading ? (
            <p className="text-sm text-gray-400">영상 목록을 불러오는 중...</p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-gray-400">채널 영상을 찾을 수 없습니다.</p>
          ) : (
            <div className="grid gap-2">
              {videos.map(v => (
                <button
                  key={v.videoId}
                  type="button"
                  onClick={() => {
                    const url = `https://www.youtube.com/watch?v=${v.videoId}`
                    setVideoUrl(url)
                    setTab('url')
                    runExtract(url)
                  }}
                  className="flex items-center gap-3 border rounded-lg p-2 hover:bg-gray-50 transition text-left"
                >
                  <img src={v.thumbnail} alt={decodeHtmlEntities(v.title)} className="w-20 h-14 object-cover rounded shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{decodeHtmlEntities(v.title)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(v.publishedAt).toLocaleDateString('ko-KR')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 탭B: URL 직접 입력 */}
      {tab === 'url' && (
        <div className="flex gap-2">
          <input
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:border-blue-400"
          />
          <button
            type="button"
            disabled={!videoUrl.trim() || extracting}
            onClick={() => runExtract(videoUrl)}
            className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition shrink-0"
          >
            {extracting ? '추출 중...' : '자동 추출'}
          </button>
        </div>
      )}

      {extractError && <p className="text-sm text-red-600">{extractError}</p>}

      {/* 추출 결과 카드 */}
      {cards.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{cards.length}개 장소 추출됨</p>
          {cards.map((card, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-3 space-y-2 transition ${card.included ? '' : 'opacity-40'}`}
            >
              <div className="flex items-center gap-2">
                <input
                  value={card.name}
                  onChange={e => updateCard(idx, { name: e.target.value })}
                  onBlur={() => searchKakao(idx, card.name)}
                  className="flex-1 text-sm font-medium border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
                />
                {card.timestamp_seconds !== null && (
                  <span className="text-xs text-gray-400 shrink-0">{secondsToMmss(card.timestamp_seconds)}</span>
                )}
                <button
                  type="button"
                  onClick={() => updateCard(idx, { included: !card.included })}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition shrink-0 ${
                    card.included
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-500 border-gray-300'
                  }`}
                >
                  {card.included ? '포함' : '제외'}
                </button>
              </div>

              {/* 카카오 드롭다운 */}
              {card.searchOpen && card.searchResults.length > 0 && (
                <div className="border rounded-lg overflow-hidden divide-y bg-white shadow-sm">
                  {card.searchResults.map((r, ri) => (
                    <button
                      key={ri}
                      type="button"
                      onClick={() => selectKakao(idx, r)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                    >
                      <p className="text-xs font-medium">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.address}</p>
                      {r.category && (
                        <p className="text-xs text-gray-300">{r.category.split(' > ').pop()}</p>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateCard(idx, { searchOpen: false })}
                    className="w-full text-center text-xs text-gray-400 px-3 py-1.5 hover:bg-gray-50"
                  >
                    닫기
                  </button>
                </div>
              )}

              {card.address && (
                <p className="text-xs text-gray-500 px-1">{card.address}</p>
              )}
            </div>
          ))}

          <button
            type="button"
            disabled={submitting || includedCount === 0}
            onClick={handleSubmit}
            className="w-full bg-black text-white text-sm font-medium py-3 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {submitting ? '요청 중...' : `장소 등록 요청하기 (${includedCount}개)`}
          </button>
        </div>
      )}
    </div>
  )
}
