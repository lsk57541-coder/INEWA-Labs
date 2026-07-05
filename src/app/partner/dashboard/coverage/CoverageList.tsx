'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PlaceRow, { type Place } from '../places/PlaceRow'
import { getVideoPlaces, syncMyChannel, type VideoCoverage } from './actions'

type Filter = 'all' | 'empty' | 'pendingCoord'
const PAGE_SIZE = 30

// 장소 0개 영상의 상태 라벨 — "추출했으나 0개(empty)"와 "아직 추출 안 함(pending)"을 구분하는 게
// 이 화면의 핵심(재추출 낭비 방지). done인데 0개면 등록/삭제로 비게 된 케이스.
const EMPTY_LABEL: Record<string, string> = {
  empty: '추출했지만 장소 없음',
  pending: '아직 추출 안 함',
  error: '추출 실패',
  done: '장소 없음',
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function CoverageList({ videos }: { videos: VideoCoverage[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<VideoCoverage | null>(null)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [loading, startLoad] = useTransition()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const autoTried = useRef(false)

  const runSync = async () => {
    if (syncing) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await syncMyChannel()
      setSyncMsg(r.synced > 0 ? `${r.synced}개 영상을 불러왔어요` : '새로 불러올 영상이 없어요')
      router.refresh()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '불러오기에 실패했어요')
    } finally {
      setSyncing(false)
    }
  }

  // partner_videos 0행(첫 사용)일 때만 1회 자동 전체 동기화. 이미 영상이 있으면 자동 실행 안 함.
  useEffect(() => {
    if (videos.length === 0 && !autoTried.current) {
      autoTried.current = true
      void runSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length])

  const counts = useMemo(
    () => ({
      all: videos.length,
      empty: videos.filter((v) => v.total === 0).length,
      pendingCoord: videos.filter((v) => v.pendingCoord > 0).length,
    }),
    [videos],
  )

  const filtered = useMemo(() => {
    if (filter === 'empty') return videos.filter((v) => v.total === 0)
    if (filter === 'pendingCoord') return videos.filter((v) => v.pendingCoord > 0)
    return videos
  }, [videos, filter])

  const shown = filtered.slice(0, shownCount)

  const changeFilter = (f: Filter) => {
    setFilter(f)
    setShownCount(PAGE_SIZE)
  }

  const openVideo = (v: VideoCoverage) => {
    setSelected(v)
    setPlaces(null)
    startLoad(async () => {
      setPlaces(await getVideoPlaces(v.video_id))
    })
  }

  // 드릴다운에서 장소 숨김/삭제 시 로컬 제거. 목록 카운트는 목록 재진입(새로고침) 때 갱신됨.
  const handleHidden = (id: string) => setPlaces((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))

  // ── Level 2: 선택한 영상의 장소들(기존 PlaceRow 재사용) ──
  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs text-gray-500 hover:text-gray-700 transition mb-3"
        >
          ← 영상 목록으로
        </button>
        <div className="mb-3">
          <p className="text-sm font-semibold">{selected.title || '(제목 없음)'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(selected.published_at)}</p>
        </div>

        {loading || places === null ? (
          <p className="text-sm text-gray-400 py-8 text-center">불러오는 중…</p>
        ) : places.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <p className="text-sm font-medium mb-1">이 영상엔 등록된 장소가 없어요</p>
            <p className="text-xs text-gray-400 mb-5">영상에서 방문 장소를 추출해 등록할 수 있어요</p>
            <Link
              href="/partner/dashboard/places/extract"
              className="inline-block bg-black text-white text-sm font-medium px-6 py-3 rounded-lg hover:bg-gray-800 transition"
            >
              영상으로 장소 등록하기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {places.map((p) => (
              <PlaceRow key={p.id} place={p} onHidden={handleHidden} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Level 1: 영상 목록(전체 영상, 0개 포함) ──
  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'empty', label: '장소 없는 영상', count: counts.empty },
    { key: 'pendingCoord', label: '좌표대기 있는 영상', count: counts.pendingCoord },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
        >
          {syncing ? '불러오는 중…' : '새 영상 불러오기'}
        </button>
        {syncMsg && <span className="text-xs text-gray-500 truncate">{syncMsg}</span>}
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => changeFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
              filter === f.key
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="border rounded-lg p-8 text-center mt-2">
          <p className="text-sm font-medium mb-1">
            {syncing ? '채널 영상을 불러오는 중…' : filter === 'all' ? '영상이 없어요' : '해당하는 영상이 없어요'}
          </p>
          <p className="text-xs text-gray-400">
            {syncing
              ? '잠시만 기다려 주세요'
              : filter === 'all'
                ? "위 '새 영상 불러오기'로 채널 영상을 가져오세요"
                : '다른 필터를 선택해 보세요'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {shown.map((v) => (
              <button
                key={v.video_id}
                type="button"
                onClick={() => openVideo(v)}
                className="w-full flex items-center gap-3 border rounded-lg px-4 py-3.5 hover:bg-gray-50 transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{v.title || '(제목 없음)'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                    {v.published_at && <span>{fmtDate(v.published_at)}</span>}
                    {v.total === 0 ? (
                      <span className={v.extract_status === 'pending' ? 'text-amber-600' : v.extract_status === 'error' ? 'text-red-500' : ''}>
                        {EMPTY_LABEL[v.extract_status] ?? '장소 없음'}
                      </span>
                    ) : (
                      <>
                        {v.visible > 0 && <span className="text-green-600">지도 {v.visible}</span>}
                        {v.pendingCoord > 0 && <span className="text-amber-600">좌표대기 {v.pendingCoord}</span>}
                        {v.hidden > 0 && <span className="text-gray-400">비공개 {v.hidden}</span>}
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${
                    v.total === 0 ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {v.total === 0 ? '장소 없음' : `${v.total}곳`}
                </span>
                <span className="text-gray-300 shrink-0 text-lg leading-none">›</span>
              </button>
            ))}
          </div>

          {shownCount < filtered.length && (
            <button
              type="button"
              onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              className="w-full mt-3 text-sm text-gray-600 border border-gray-200 rounded-lg py-2.5 hover:bg-gray-50 transition"
            >
              더 보기 ({filtered.length - shownCount}개 남음)
            </button>
          )}
        </>
      )}
    </div>
  )
}
