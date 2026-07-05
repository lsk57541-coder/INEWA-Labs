'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { bulkAddLocations } from '@/app/actions'

interface VideoInfo {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  publishedAt: string
  viewCount?: number       // 입력 시 저장 → 검색 필터(2단계)
  subscriberCount?: number // 입력 시 저장 → 검색 필터(2단계)
  registeredCount?: number // 이미 등록된 장소 수(조회 시점 중복 미리알림)
}

interface PlaceRow {
  id: string
  name: string
  address: string
  category: string
  timestampInput: string
  lat: number | null
  lng: number | null
  phone?: string | null              // 카카오 전화(저장용)
  kakaoPlaceId?: string | null       // 카카오 place id(상세 딥링크 조립·저장용)
  categoryGroupCode?: string | null  // 카카오 대분류(FD6/CE7/AD5)
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
  kakaoPlaceId?: string
  categoryGroupCode?: string
}

interface SearchModal {
  rowIdx: number
  query: string
  results: PlaceSearchResult[]
  searching: boolean
  error: string | null
}

function makeRow(name = '', timestampInput = ''): PlaceRow {
  return {
    id: Math.random().toString(36).slice(2),
    name,
    address: '',
    category: '',
    timestampInput,
    lat: null,
    lng: null,
    geocoding: false,
    geocodeError: null,
    autoFilled: false,
  }
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
// ※Kakao keyword search는 category_group_code 다중코드를 거부하므로 결과 category 문자열로 후처리.
const PLACE_CATEGORY_RE = /(음식점|카페|음식|디저트|베이커리|주점|관광|명소|숙박|호텔|펜션|게스트|리조트|문화)/

function secondsToMmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [videoFetching, setVideoFetching] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)

  const [places, setPlaces] = useState<PlaceRow[]>([makeRow()])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedCount, setExtractedCount] = useState<number | null>(null)
  const [region, setRegion] = useState('')
  const [autoGeocoding, setAutoGeocoding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ succeeded: number; errors: string[] } | null>(null)
  const [duplicate, setDuplicate] = useState<{ existingPlaces: number } | null>(null)
  const [lastSaved, setLastSaved] = useState<{ count: number } | null>(null)

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
    setPlaces([makeRow()])
    setExtractError(null)
    setExtractedCount(null)
    setRegion('')
    setLastSaved(null)
    try {
      const res = await fetch(`/api/admin/video-info?url=${encodeURIComponent(videoUrl.trim())}`)
      const data = await res.json() as VideoInfo & { error?: string }
      if (!res.ok) { setVideoError(data.error ?? '영상 조회 실패'); return }
      setVideoInfo(data)
      setRegion(regionHintFromTitle(data.title)) // 제목에서 지역 자동 추정(편집 가능)
    } catch {
      setVideoError('네트워크 오류')
    } finally {
      setVideoFetching(false)
    }
  }, [videoUrl])

  // 추출 가게명 1건을 "지역 + 가게명"으로 Kakao 자동 조회. 오매칭 방지 3중 가드:
  // ①카테고리(음식점/카페/숙박) ②결과 주소가 지역 포함 ③Kakao 상호명이 추출명과 매칭.
  // 셋 다 통과해야 좌표 채움(autoFilled). 아니면 null → 빈칸 유지(수동 [검색]).
  const geocodeByName = useCallback(async (rgn: string, name: string): Promise<Partial<PlaceRow> | null> => {
    if (!name.trim()) return null
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(`${rgn} ${name}`)}&list=1`)
      const json = await res.json() as { results?: PlaceSearchResult[] }
      const hit = (json.results ?? []).find(r =>
        (!rgn || (r.address ?? '').includes(rgn)) &&   // 지역 가드
        namesMatch(name, r.name) &&                     // 상호명 매칭 가드
        (!r.category || PLACE_CATEGORY_RE.test(r.category)) // 카테고리 가드(후처리)
      )
      if (!hit) return null
      return {
        lat: hit.lat, lng: hit.lng, address: hit.address,
        category: hit.category ? hit.category.split('>').pop()?.trim() ?? '' : '',
        phone: hit.phone ?? null,
        kakaoPlaceId: hit.kakaoPlaceId ?? null,
        categoryGroupCode: hit.categoryGroupCode ?? null,
        autoFilled: true, geocodeError: null,
      }
    } catch { return null }
  }, [])

  // "가게명 + 📍주소" 페어 형식: 명시 주소가 있으면 그 주소로 직접 geocode(가게명 검색보다 정확).
  // 첫 결과 좌표를 채우고, 표시 주소는 창작자 제공 주소(row.address) 유지.
  const geocodeByAddress = useCallback(async (address: string): Promise<Partial<PlaceRow> | null> => {
    if (!address.trim()) return null
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address.trim())}&list=1`)
      const json = await res.json() as { results?: PlaceSearchResult[] }
      const hit = (json.results ?? [])[0]
      if (!hit) return null
      return {
        lat: hit.lat, lng: hit.lng,
        phone: hit.phone ?? null,
        kakaoPlaceId: hit.kakaoPlaceId ?? null,
        categoryGroupCode: hit.categoryGroupCode ?? null,
        autoFilled: true, geocodeError: null,
      }
    } catch { return null }
  }, [])

  // 추출 직후 전체 행을 병렬 자동 geocode. 주소 있으면 주소 기반(정확), 없으면 "지역+가게명"(가드 통과분만).
  const autoGeocodeRows = useCallback(async (rows: PlaceRow[], rgn: string) => {
    setAutoGeocoding(true)
    const filled = await Promise.all(rows.map(async (r) => {
      const hit = r.address.trim() ? await geocodeByAddress(r.address) : await geocodeByName(rgn, r.name)
      return hit ? { ...r, ...hit } : r
    }))
    setPlaces(filled)
    setAutoGeocoding(false)
  }, [geocodeByName, geocodeByAddress])

  const autoExtract = useCallback(async () => {
    if (!videoInfo) return
    setExtracting(true)
    setExtractError(null)
    try {
      const res = await fetch(`/api/admin/extract-places?videoId=${encodeURIComponent(videoInfo.videoId)}`)
      const data = await res.json() as { places?: { name: string; timestamp_seconds: number | null; address?: string }[]; error?: string }
      if (!res.ok || !data.places) {
        setExtractError(data.error ?? '추출 실패')
        return
      }
      if (data.places.length === 0) {
        setExtractError('영상 설명에서 상호명을 찾지 못했습니다. 직접 입력해주세요.')
        return
      }
      const rows = data.places.map(p => {
        const row = makeRow(p.name, p.timestamp_seconds != null ? secondsToMmss(p.timestamp_seconds) : '')
        row.address = p.address ?? '' // "가게명 + 📍주소" 페어 형식에서 추출된 주소 프리필
        return row
      })
      setPlaces(rows)
      setExtractedCount(data.places.length)
      // 주소 있는 행은 주소 기반, 없는 행은 지역+가게명으로 자동 좌표(주소 형식이면 지역 없어도 동작).
      void autoGeocodeRows(rows, region.trim())
    } catch {
      setExtractError('네트워크 오류')
    } finally {
      setExtracting(false)
    }
  }, [videoInfo, region, autoGeocodeRows])

  const geocodeAddress = useCallback(async (idx: number, addressOverride?: string) => {
    const addr = addressOverride ?? places[idx]?.address
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
      // 1차: 음식점/카페/숙박 카테고리 필터
      const res1 = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}&list=1&category_group_code=FD6,CE7,AD5`)
      const json1 = await res1.json() as { results?: PlaceSearchResult[] }
      const results1 = json1.results ?? []

      if (results1.length > 0) {
        setModal(prev => prev ? { ...prev, searching: false, results: results1 } : null)
        return
      }

      // 폴백: 카테고리 필터 없이 재검색
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
      category: result.category ? result.category.split('>').pop()?.trim() ?? result.category : r.category,
      lat: result.lat,
      lng: result.lng,
      phone: result.phone ?? null,
      kakaoPlaceId: result.kakaoPlaceId ?? null,
      categoryGroupCode: result.categoryGroupCode ?? null,
      geocodeError: null,
      autoFilled: false,
    } : r))
    setModal(null)
  }, [modal])

  const doSave = async (replace: boolean) => {
    if (!videoInfo) return
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
          view_count: videoInfo.viewCount,
          subscriber_count: videoInfo.subscriberCount,
        },
        valid.map(r => ({
          name: r.name.trim(),
          address: r.address.trim(),
          category: r.category.trim() || undefined,
          lat: r.lat!,
          lng: r.lng!,
          timestamp_sec: parseTimestamp(r.timestampInput),
          phone: r.phone ?? undefined,
          kakao_place_id: r.kakaoPlaceId ?? undefined,
          category_group_code: r.categoryGroupCode ?? undefined,
        })),
        { replace }
      )
      if (result.duplicate) {
        setDuplicate(result.duplicate) // 이미 등록된 videoId → 덮어쓰기 확인 배너
        return
      }
      setDuplicate(null)
      if (result.errors.length === 0) {
        // 연속 입력: /admin으로 이동하지 않고 폼 초기화 + 완료 배너 → 바로 다음 영상 입력.
        setLastSaved({ count: result.succeeded })
        setVideoUrl('')
        setVideoInfo(null)
        setPlaces([makeRow()])
        setExtractedCount(null)
        setRegion('')
        setSaveResult(null)
      } else {
        setSaveResult(result) // 일부 실패 → 폼 유지하고 에러 표시(수정 후 재저장)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!videoInfo) return
    const needGeocode = places.filter(r => r.address.trim() && r.lat === null)
    if (needGeocode.length > 0) {
      await Promise.all(places.map((_, i) => geocodeAddress(i)))
      return
    }
    setDuplicate(null)
    await doSave(false)
  }

  // 저장은 name+좌표 모두 있는 행만 들어감(handleSubmit의 valid 필터와 동일 기준).
  // 좌표 없는 행이 조용히 누락되는 함정을 저장 전에 미리 보여주기 위한 카운트.
  const namedCount = places.filter(r => r.name.trim()).length
  const validCount = places.filter(r => r.name.trim() && r.lat !== null && r.lng !== null).length
  const missingCoords = namedCount - validCount

  return (
    <>
      <div className="space-y-6">
        {/* 저장 완료 — 연속 입력용. 다음 영상 조회 시 자동 사라짐. */}
        {lastSaved && (
          <div className="border border-green-300 bg-green-50 rounded-lg p-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-green-800">✓ {lastSaved.count}개 저장 완료 — 다음 영상 URL을 입력하세요</p>
            <button
              onClick={() => setLastSaved(null)}
              className="shrink-0 text-green-700 hover:text-green-900 text-sm"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}

        {/* YouTube URL */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">YouTube 영상 URL</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={videoUrl}
              onChange={e => { setVideoUrl(e.target.value); setVideoInfo(null); setVideoError(null); setExtractError(null) }}
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
            <div className="space-y-3">
              <div className="flex gap-3 items-start bg-gray-50 rounded-lg p-3">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-24 h-14 object-cover rounded shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium line-clamp-2">{videoInfo.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{videoInfo.channel}</p>
                  {!!videoInfo.registeredCount && (
                    <p className="text-xs text-amber-700 font-medium mt-1">
                      ⚠️ 이미 등록된 영상입니다 (장소 {videoInfo.registeredCount}개 등록됨) — 저장 시 덮어쓰기 확인이 뜹니다
                    </p>
                  )}
                </div>
              </div>

              {/* 지역(자동 좌표 보조) — 제목에서 자동 추정, 편집 가능. "지역 + 가게명"으로 Kakao 조회 + 오매칭 가드 */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">지역(자동 좌표)</label>
                <input
                  type="text"
                  value={region}
                  onChange={e => setRegion(e.target.value)}
                  placeholder="예: 제주 (비우면 자동 좌표 끔)"
                  className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Auto-extract button */}
              <button
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
        </div>

        {/* Place rows */}
        {videoInfo && (
          <div className="space-y-3">
            <p className="text-sm font-medium">장소 목록</p>

            {places.map((row, idx) => (
              <div key={row.id} className="border rounded-lg p-4 space-y-3">
                {/* Name + search + remove */}
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
                    onChange={e => updateRow(idx, { address: e.target.value, lat: null, lng: null, geocodeError: null, autoFilled: false })}
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
                  <p className="text-xs text-gray-400">
                    {row.autoFilled && <span className="text-green-600 font-medium">✓ 자동 — 주소 확인 </span>}
                    {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                  </p>
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

        {/* 중복 영상 — 덮어쓰기 확인 */}
        {duplicate && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-amber-800">
              이미 등록된 영상입니다 (장소 {duplicate.existingPlaces}개). 덮어쓰기하면 기존 {duplicate.existingPlaces}개를 지우고 이번 입력으로 새로 저장합니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => doSave(true)}
                disabled={saving}
                className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-40 transition"
              >
                {saving ? '덮어쓰는 중…' : '덮어쓰기 (재등록)'}
              </button>
              <button
                onClick={() => setDuplicate(null)}
                disabled={saving}
                className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* Submit */}
        {videoInfo && !duplicate && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs">
              <span className="text-gray-600">유효 장소(좌표 있음): </span>
              <span className="font-semibold text-gray-900">{validCount}개</span>
              {missingCoords > 0 && (
                <span className="text-amber-600"> · 좌표 없는 {missingCoords}개는 저장 제외</span>
              )}
            </p>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="shrink-0 text-sm bg-black text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {saving ? '저장 중…' : `일괄 저장 (${validCount}개)`}
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
