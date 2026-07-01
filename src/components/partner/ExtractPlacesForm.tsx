'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { bulkRequestPlaces, type BulkPlaceInput } from '@/app/partner/dashboard/places/actions'
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities'

interface ChannelVideo {
  videoId: string
  title: string
  thumbnail: string
  publishedAt: string
}

// 파트너 video-info 응답(본인채널 검사 통과분만). admin VideoInfo의 파트너판.
interface VideoInfo {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  publishedAt: string
  viewCount?: number
  registeredCount?: number // 이미 이 영상으로 등록한 장소 수(정보성 — 덮어쓰기 없음)
}

// 추출 출처 — 엔진(extractPlaces.ts)이 반환하는 값. 수동 추가 행은 출처가 없어 null.
type PlaceSource = 'coords' | 'timestamp' | 'ai' | 'list' | null

interface PlaceRow {
  id: string
  name: string
  address: string
  category: string
  timestampSec: number | null // 등장시간 — 표시 전용(places에 컬럼 없어 저장 안 함)
  source: PlaceSource         // 추출 출처(places.source로 저장). 수동 추가 행은 null.
  lat: number | null
  lng: number | null
  geocoding: boolean
  geocodeError: string | null
  autoFilled: boolean
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

function makeRow(name = '', timestampSec: number | null = null, source: PlaceSource = null): PlaceRow {
  return {
    id: Math.random().toString(36).slice(2),
    name,
    address: '',
    category: '',
    timestampSec,
    source,           // 수동 추가(인자 생략) 시 null
    lat: null,
    lng: null,
    geocoding: false,
    geocodeError: null,
    autoFilled: false,
  }
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

// 제목에서 지역 힌트 추정(자동 좌표 보조용 prefix + 오매칭 가드). 못 찾으면 빈 문자열.
const REGION_TOKENS = ['제주', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '수원', '성남', '용인', '고양', '가평', '강릉', '속초', '여수', '전주', '경주', '포항', '춘천', '통영', '거제', '김포', '파주', '양양', '강원', '경기', '충북', '충남', '전북', '전남', '경북', '경남']
function regionHintFromTitle(title: string): string {
  return REGION_TOKENS.find(t => title.includes(t)) ?? ''
}
function normName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}
// Kakao 결과 상호명이 추출 가게명과 매칭되는지(부분 포함). 동명 타업소 오매칭 방지용.
function namesMatch(a: string, b: string): boolean {
  const x = normName(a), y = normName(b)
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))
}
// 장소류 카테고리 허용(음식점/카페/관광/숙박/문화 등). "법률사무소" 같은 동명 타업종 오매칭 차단.
const PLACE_CATEGORY_RE = /(음식점|카페|음식|디저트|베이커리|주점|관광|명소|숙박|호텔|펜션|게스트|리조트|문화)/

export default function ExtractPlacesForm() {
  const [tab, setTab] = useState<'channel' | 'url'>('channel')
  const [videos, setVideos] = useState<ChannelVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)

  const [videoUrl, setVideoUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [videoFetching, setVideoFetching] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)

  const [region, setRegion] = useState('')
  const [places, setPlaces] = useState<PlaceRow[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedCount, setExtractedCount] = useState<number | null>(null)
  const [autoGeocoding, setAutoGeocoding] = useState(false)

  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ succeeded: number; updated: number; errors: string[] } | null>(null)

  const [modal, setModal] = useState<SearchModal | null>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setVideosLoading(true)
    fetch('/api/partner/channel-videos')
      .then(r => r.json())
      .then((data: { videos?: ChannelVideo[] }) => {
        if (data.videos) setVideos(data.videos)
      })
      .finally(() => setVideosLoading(false))
  }, [])

  useEffect(() => {
    if (modal) modalInputRef.current?.focus()
  }, [modal?.rowIdx])

  // URL/채널선택 공통 진입점 — 조회(미리보기) 단계. 본인채널 제한은 video-info 라우트가 서버사이드로 가드.
  const loadVideo = useCallback(async (videoId: string, canonicalUrl: string) => {
    setVideoFetching(true)
    setVideoError(null)
    setVideoInfo(null)
    setPlaces([])
    setExtractError(null)
    setExtractedCount(null)
    setRegion('')
    setVideoUrl(canonicalUrl)
    try {
      const res = await fetch(`/api/partner/video-info?videoId=${videoId}`)
      const data = await res.json() as VideoInfo & { error?: string }
      if (!res.ok) { setVideoError(data.error ?? '영상 조회에 실패했어요.'); return }
      setVideoInfo(data)
      setRegion(regionHintFromTitle(data.title)) // 제목에서 지역 자동 추정(편집 가능)
    } catch {
      setVideoError('네트워크 오류로 조회에 실패했어요.')
    } finally {
      setVideoFetching(false)
    }
  }, [])

  const fetchByUrl = useCallback(() => {
    const videoId = extractVideoId(videoUrl.trim())
    if (!videoId) { setVideoError('올바른 YouTube URL을 입력해주세요.'); return }
    void loadVideo(videoId, videoUrl.trim())
  }, [videoUrl, loadVideo])

  // 추출 가게명 1건을 "지역 + 가게명"으로 Kakao 자동 조회. 오매칭 방지 3중 가드:
  // ①카테고리(음식점/카페/숙박) ②결과 주소가 지역 포함 ③Kakao 상호명이 추출명과 매칭.
  const geocodeByName = useCallback(async (rgn: string, name: string): Promise<Partial<PlaceRow> | null> => {
    if (!name.trim()) return null
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(`${rgn} ${name}`)}&list=1`)
      const json = await res.json() as { results?: PlaceSearchResult[] }
      const hit = (json.results ?? []).find(r =>
        (!rgn || (r.address ?? '').includes(rgn)) &&
        namesMatch(name, r.name) &&
        (!r.category || PLACE_CATEGORY_RE.test(r.category))
      )
      if (!hit) return null
      return {
        lat: hit.lat, lng: hit.lng, address: hit.address,
        category: hit.category ? hit.category.split('>').pop()?.trim() ?? '' : '',
        autoFilled: true, geocodeError: null,
      }
    } catch { return null }
  }, [])

  // 추출 직후 전체 행을 병렬 자동 geocode("지역+가게명", 가드 통과분만 좌표 채움).
  const autoGeocodeRows = useCallback(async (rows: PlaceRow[], rgn: string) => {
    setAutoGeocoding(true)
    const filled = await Promise.all(rows.map(async (r) => {
      const hit = await geocodeByName(rgn, r.name)
      return hit ? { ...r, ...hit } : r
    }))
    setPlaces(filled)
    setAutoGeocoding(false)
  }, [geocodeByName])

  const autoExtract = useCallback(async () => {
    if (!videoInfo) return
    setExtracting(true)
    setExtractError(null)
    setPlaces([])
    setExtractedCount(null)
    // 추출은 본인채널 가드가 박힌 공유 라우트 그대로 사용. extractPlaces 엔진은 수정하지 않음.
    try {
      const res = await fetch(`/api/partner/extract-places?videoId=${videoInfo.videoId}`)
      // source는 엔진(extractPlaces.ts)이 이미 반환 → 응답에 그대로 살아옴. 행까지 보존해 저장 경로로 전달.
      const data = await res.json() as { places?: { name: string; timestamp_seconds: number | null; source?: PlaceSource }[]; error?: string }
      if (!res.ok || data.error) {
        setExtractError(data.error ?? '추출 중 오류가 발생했어요.')
        return
      }
      const list = data.places ?? []
      if (list.length === 0) {
        setExtractError('영상 설명에서 상호명을 찾지 못했어요. 아래 "+ 장소 추가"로 직접 입력해주세요.')
        return
      }
      const rows = list.map(p => makeRow(p.name, p.timestamp_seconds, p.source ?? null))
      setPlaces(rows)
      setExtractedCount(list.length)
      void autoGeocodeRows(rows, region.trim())
    } catch {
      setExtractError('추출 중 오류가 났어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setExtracting(false)
    }
  }, [videoInfo, region, autoGeocodeRows])

  const updateRow = useCallback((idx: number, patch: Partial<PlaceRow>) => {
    setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }, [])

  const removeRow = useCallback((idx: number) => {
    setPlaces(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // 주소 입력 후 포커스 이동 시 자동 좌표 변환(admin과 동일 — /api/geocode 공유).
  const geocodeAddress = useCallback(async (idx: number) => {
    const addr = places[idx]?.address
    if (!addr?.trim()) return
    setPlaces(prev => prev.map((r, i) => i === idx ? { ...r, geocoding: true, geocodeError: null } : r))
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(addr.trim())}&list=1`)
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

  const openSearchModal = useCallback((idx: number) => {
    setModal({ rowIdx: idx, query: places[idx].name, results: [], searching: false, error: null })
  }, [places])

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) return
    setModal(prev => prev ? { ...prev, searching: true, error: null, results: [] } : null)
    try {
      const res1 = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&list=1&category_group_code=FD6,CE7,AD5`)
      const json1 = await res1.json() as { results?: PlaceSearchResult[] }
      const results1 = json1.results ?? []
      if (results1.length > 0) {
        setModal(prev => prev ? { ...prev, searching: false, results: results1 } : null)
        return
      }
      const res2 = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&list=1`)
      const json2 = await res2.json() as { results?: PlaceSearchResult[] }
      const results2 = json2.results ?? []
      setModal(prev => prev ? {
        ...prev,
        searching: false,
        results: results2,
        error: results2.length === 0 ? '검색 결과가 없습니다' : null,
      } : null)
    } catch {
      setModal(prev => prev ? { ...prev, searching: false, error: '검색 실패' } : null)
    }
  }, [])

  const selectPlace = useCallback((result: PlaceSearchResult) => {
    if (!modal) return
    const idx = modal.rowIdx
    setPlaces(prev => prev.map((r, i) => i === idx ? {
      ...r,
      name: result.name,
      address: result.address,
      category: result.category ? result.category.split('>').pop()?.trim() ?? r.category : r.category,
      lat: result.lat,
      lng: result.lng,
      geocodeError: null,
      autoFilled: false,
    } : r))
    setModal(null)
  }, [modal])

  // 저장: 좌표 있는 유효 행만(좌표 없으면 지도에 안 뜸). bulkRequestPlaces 단일 경로 — places·partner_id·active.
  const handleSave = async () => {
    const valid = places.filter(r => r.name.trim() && r.lat !== null && r.lng !== null)
    if (valid.length === 0) return
    setSaving(true)
    const payload: BulkPlaceInput[] = valid.map(r => ({
      name: r.name.trim(),
      address: r.address.trim() || undefined,
      category: r.category.trim() || undefined,
      video_url: videoUrl || undefined,
      latitude: r.lat ?? undefined,
      longitude: r.lng ?? undefined,
      view_count: videoInfo?.viewCount,
      published_at: videoInfo?.publishedAt,
      source: r.source ?? undefined,  // 추출 출처(수동 행은 undefined → insert에서 null)
      video_title: videoInfo ? decodeHtmlEntities(videoInfo.title) : undefined,  // 영상 제목(그룹 헤더용, 엔티티 정리)
    }))
    const result = await bulkRequestPlaces(payload)
    setSubmitResult(result)
    setSubmitted(true)
    setSaving(false)
  }

  if (submitted && submitResult) {
    return (
      <div className="text-center py-12">
        <p className="text-2xl mb-2">✓</p>
        <p className="font-medium mb-1">등록 완료!</p>
        <p className="text-sm text-gray-500 mb-1">추가한 장소가 지도에 바로 반영됐어요.</p>
        {submitResult.succeeded > 0 && (
          <p className="text-xs text-gray-400 mt-1">{submitResult.succeeded}개 신규 등록</p>
        )}
        {submitResult.updated > 0 && (
          <p className="text-xs text-gray-400 mt-1">{submitResult.updated}개는 이미 등록된 영상이라 기존 장소를 갱신했어요</p>
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

  const namedCount = places.filter(r => r.name.trim()).length
  const validCount = places.filter(r => r.name.trim() && r.lat !== null && r.lng !== null).length
  const missingCoords = namedCount - validCount

  return (
    <>
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
                    onClick={() => loadVideo(v.videoId, `https://www.youtube.com/watch?v=${v.videoId}`)}
                    className={`flex items-center gap-3 border rounded-lg p-2 hover:bg-gray-50 transition text-left ${
                      videoInfo?.videoId === v.videoId ? 'border-blue-500 ring-1 ring-blue-200' : ''
                    }`}
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
          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">YouTube 영상 URL</p>
            <div className="flex gap-2">
              <input
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchByUrl()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={!videoUrl.trim() || videoFetching}
                onClick={fetchByUrl}
                className="shrink-0 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {videoFetching ? '조회 중…' : '조회'}
              </button>
            </div>
            <p className="text-xs text-gray-400">본인 채널 영상만 등록할 수 있어요.</p>
          </div>
        )}

        {videoError && <p className="text-sm text-red-600">{videoError}</p>}

        {/* 미리보기 + 지역 + 자동추출 */}
        {videoInfo && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex gap-3 items-start bg-gray-50 rounded-lg p-3">
              <img src={videoInfo.thumbnail} alt={decodeHtmlEntities(videoInfo.title)} className="w-24 h-14 object-cover rounded shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium line-clamp-2">{decodeHtmlEntities(videoInfo.title)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{videoInfo.channel}</p>
                {!!videoInfo.registeredCount && (
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    ℹ️ 이미 이 영상으로 {videoInfo.registeredCount}개 등록했어요 — 저장하면 추가됩니다.
                  </p>
                )}
              </div>
            </div>

            {/* 지역(자동 좌표 보조) */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">지역(자동 좌표)</label>
              <input
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="예: 제주 (비우면 자동 좌표 끔)"
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={autoExtract}
              disabled={extracting}
              className="w-full text-sm border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-40 rounded-lg py-2 transition"
            >
              {extracting ? '설명에서 가게명 추출 중…' : '자동 추출 — 설명 가게명 + 지역으로 좌표까지'}
            </button>
            {extractError && <p className="text-xs text-red-500">{extractError}</p>}
            {extractedCount !== null && (
              <p className="text-xs text-blue-600 font-medium">
                추출된 장소: {extractedCount}개
                {autoGeocoding && <span className="text-gray-400"> · 좌표 자동 채우는 중…</span>}
              </p>
            )}
          </div>
        )}

        {/* 장소 목록 */}
        {videoInfo && places.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">장소 목록</p>

            {places.map((row, idx) => (
              <div key={row.id} className="border rounded-lg p-4 space-y-3">
                {/* 장소명 + 검색 + 등장시간 + 삭제 */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => updateRow(idx, { name: e.target.value })}
                    placeholder="장소명"
                    className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {row.timestampSec !== null && (
                    <span className="text-xs text-gray-400 shrink-0">{secondsToMmss(row.timestampSec)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => openSearchModal(idx)}
                    className="shrink-0 text-sm border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition"
                  >
                    검색
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 px-1 transition"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>

                {/* 주소 */}
                <div className="relative">
                  <input
                    type="text"
                    value={row.address}
                    onChange={e => updateRow(idx, { address: e.target.value, lat: null, lng: null, geocodeError: null, autoFilled: false })}
                    onBlur={() => geocodeAddress(idx)}
                    placeholder="주소 (입력 후 포커스 이동 시 자동 좌표 변환)"
                    className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {row.geocoding && (
                    <span className="absolute right-3 top-2.5 text-xs text-gray-400">변환 중…</span>
                  )}
                </div>
                {row.geocodeError && <p className="text-xs text-red-500">{row.geocodeError}</p>}
                {row.lat !== null && row.lng !== null && (
                  <p className="text-xs text-gray-400">
                    {row.autoFilled && <span className="text-green-600 font-medium">✓ 자동 — 주소 확인 </span>}
                    {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                  </p>
                )}

                {/* 카테고리 */}
                <input
                  type="text"
                  value={row.category}
                  onChange={e => updateRow(idx, { category: e.target.value })}
                  placeholder="카테고리 (예: 음식점, 카페)"
                  className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => setPlaces(prev => [...prev, makeRow()])}
              className="w-full text-sm border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 rounded-lg py-3 transition"
            >
              + 장소 추가
            </button>
          </div>
        )}

        {/* 수동 추가만 했고 추출 전인 경우에도 행 추가 가능하게 */}
        {videoInfo && places.length === 0 && extractedCount === null && (
          <button
            type="button"
            onClick={() => setPlaces([makeRow()])}
            className="w-full text-sm border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 rounded-lg py-3 transition"
          >
            + 장소 직접 추가
          </button>
        )}

        {/* 저장 */}
        {videoInfo && places.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs">
              <span className="text-gray-600">유효 장소(좌표 있음): </span>
              <span className="font-semibold text-gray-900">{validCount}개</span>
              {missingCoords > 0 && (
                <span className="text-amber-600"> · 좌표 없는 {missingCoords}개는 저장 제외</span>
              )}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || validCount === 0}
              className="shrink-0 text-sm bg-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {saving ? '저장 중…' : `일괄 저장 (${validCount}개)`}
            </button>
          </div>
        )}
      </div>

      {/* 장소 검색 모달 */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div className="bg-white rounded-lg w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="text-sm font-medium">장소 검색</p>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none transition"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2 p-4 border-b shrink-0">
              <input
                ref={modalInputRef}
                type="text"
                value={modal.query}
                onChange={e => setModal(prev => prev ? { ...prev, query: e.target.value, error: null } : null)}
                onKeyDown={e => e.key === 'Enter' && runSearch(modal.query)}
                placeholder="상호명 또는 주소 입력"
                className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => runSearch(modal.query)}
                disabled={modal.searching || !modal.query.trim()}
                className="shrink-0 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {modal.searching ? '검색 중…' : '검색'}
              </button>
            </div>

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
                  type="button"
                  onClick={() => selectPlace(result)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 transition"
                >
                  <p className="text-sm font-medium text-gray-900">{result.name}</p>
                  {result.category && (
                    <p className="text-xs text-blue-600 mt-0.5">{result.category.split('>').pop()?.trim()}</p>
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
