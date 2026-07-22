'use client'

import Link from 'next/link'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import PlaceRow, { type Place } from './PlaceRow'
import AddPlaceModal from './AddPlaceModal'
import { addPlace, type PlaceInput } from './actions'

type Action = { type: 'remove'; id: string } | { type: 'add'; place: Place }

// 영상별 그룹핑 — 유튜버 사고 단위는 "내 영상". video_url의 videoId로 묶는다(표기 달라도 한 그룹).
const UNLINKED = '__unlinked__'

function videoIdFromUrl(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|watch\?v=|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : null
}
// 그룹 키: URL 없음/빈값 → 미연결. videoId 뽑히면 그것, 아니면 raw URL(표기 달라도 같은 영상은 합쳐짐).
function videoKeyOf(place: Place): string {
  const url = (place.video_url ?? '').trim()
  if (!url) return UNLINKED
  return videoIdFromUrl(url) ?? url
}
function isUnverified(p: Place): boolean {
  return p.source === 'ai' && (p.verification_status ?? 'unverified') === 'unverified'
}

interface VideoGroup {
  key: string
  label: string
  count: number
  unverifiedCount: number
  isUnlinked: boolean
  videoUrl: string | null  // 대표 영상 URL(헤더 "영상 보기" 링크용). 미연결/비URL이면 null.
  places: Place[]
}

function buildGroups(places: Place[]): VideoGroup[] {
  const order: string[] = []
  const map = new Map<string, Place[]>()
  for (const p of places) {
    const k = videoKeyOf(p)
    if (!map.has(k)) { map.set(k, []); order.push(k) }
    map.get(k)!.push(p)
  }
  const groups: VideoGroup[] = order.map((k) => {
    const rows = map.get(k)!
    const isUnlinked = k === UNLINKED
    // 헤더 라벨: 실제 영상 제목 우선, 없으면(옛 행 등 null) "대표 장소명 외 N-1곳" 폴백.
    const title = rows.find((r) => (r.video_title ?? '').trim())?.video_title?.trim()
    const first = rows[0]?.name?.trim() || '이름 없는 장소'
    const label = isUnlinked
      ? '(영상 미연결)'
      : (title || (rows.length > 1 ? `${first} 외 ${rows.length - 1}곳` : first))
    // 대표 영상 URL — 같은 영상이라 아무 장소나 동일. http(s)만(깨진 href 방지). 미연결이면 null.
    const videoUrl = isUnlinked
      ? null
      : (rows.find((r) => /^https?:\/\//.test((r.video_url ?? '').trim()))?.video_url?.trim() ?? null)
    return {
      key: k,
      label,
      count: rows.length,
      unverifiedCount: rows.filter(isUnverified).length,
      isUnlinked,
      videoUrl,
      places: rows,
    }
  })
  // 미연결 그룹은 항상 맨 아래(안정 정렬이라 나머지는 첫 등장 순 유지).
  groups.sort((a, b) => (a.isUnlinked ? 1 : 0) - (b.isUnlinked ? 1 : 0))
  return groups
}

export default function PlacesList({ places }: { places: Place[] }) {
  const [optimisticPlaces, applyOptimistic] = useOptimistic(places, (state: Place[], action: Action) => {
    if (action.type === 'remove') return state.filter((p) => p.id !== action.id)
    return [action.place, ...state]
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // addPlace는 성공 시 {} , 실패 시 {error:'키'} 반환(Server Action throw message가 프로덕션서
  // 가려지는 문제 → expected error를 키로 받아 배너 안내). 에러면 useOptimistic가 temp 행을 자동 롤백.
  const [addError, setAddError] = useState<string | null>(null)

  const groups = useMemo(() => buildGroups(optimisticPlaces), [optimisticPlaces])
  // 삭제/비공개로 그룹이 비면 groups에서 사라짐 → selectedGroup=null → 자동으로 Level1 복귀.
  const selectedGroup = selectedKey ? groups.find((g) => g.key === selectedKey) ?? null : null

  const handleHidden = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id })
    })
  }

  const handleAdd = (data: PlaceInput) => {
    setModalOpen(false)
    setAddError(null)
    const tempPlace: Place = {
      id: `temp-${Date.now()}`,
      name: data.name,
      address: data.address ?? null,
      category: data.category ?? null,
      video_url: data.video_url ?? null,
      status: 'reviewing',
      click_count: 0,
    }
    startTransition(async () => {
      applyOptimistic({ type: 'add', place: tempPlace })
      const result = await addPlace(data)
      if (result?.error) setAddError(result.error)
    })
  }

  const verifyBanner = (
    <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-3">
      AI가 찾은 장소는 정확도 확인이 필요해요. “맞아요/아니에요”로 확인해 주세요.
    </p>
  )

  // 그룹B 컨벤션(빨간 배너) — verifyBanner와 같은 박스 스타일의 빨강 버전으로 통일.
  const ADD_ERROR_TEXT: Record<string, string> = {
    no_name: '상호명을 입력해 주세요.',
    login_expired: '로그인이 만료됐어요. 다시 로그인해 주세요.',
    no_partner: '파트너 정보를 확인할 수 없어요. 계속되면 문의해 주세요.',
  }
  const addErrorBanner = addError ? (
    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
      {ADD_ERROR_TEXT[addError] ?? '문제가 발생했어요. 다시 시도해 주세요.'}
    </p>
  ) : null

  // ── 빈 상태(장소 0개) — 기존 안내 그대로 ──
  if (optimisticPlaces.length === 0) {
    return (
      <div>
        {modalOpen && <AddPlaceModal onSubmit={handleAdd} onClose={() => setModalOpen(false)} />}
        {addErrorBanner}
        <div className="border rounded-lg p-8 text-center mt-2">
          <p className="text-sm font-medium mb-1">등록된 장소가 없어요</p>
          <p className="text-xs text-gray-400 mb-6">영상에서 방문 장소를 자동으로 추출해 등록할 수 있어요</p>
          <Link
            href="/partner/dashboard/places/extract"
            className="inline-block bg-black text-white text-sm font-medium px-6 py-3 rounded-lg hover:bg-gray-800 transition"
          >
            영상으로 장소 등록하기
          </Link>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition"
            >
              직접 입력하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Level 2: 영상 클릭 → 그 영상의 장소들만(기존 PlaceRow 그대로) ──
  if (selectedGroup) {
    return (
      <div>
        {modalOpen && <AddPlaceModal onSubmit={handleAdd} onClose={() => setModalOpen(false)} />}
        {addErrorBanner}
        <button
          type="button"
          onClick={() => setSelectedKey(null)}
          className="text-xs text-gray-500 hover:text-gray-700 transition mb-3"
        >
          ← 영상 목록으로
        </button>
        <div className="mb-3">
          {selectedGroup.videoUrl ? (
            <a
              href={selectedGroup.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1 text-sm font-semibold text-blue-600 hover:underline"
            >
              <span className="shrink-0">▶</span>
              <span className="min-w-0">{selectedGroup.label}</span>
            </a>
          ) : (
            <p className={`text-sm font-semibold ${selectedGroup.isUnlinked ? 'text-gray-500' : ''}`}>
              {selectedGroup.label}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedGroup.count}곳
            {selectedGroup.unverifiedCount > 0 && (
              <span className="text-blue-600 font-medium"> · 확인 {selectedGroup.unverifiedCount}</span>
            )}
          </p>
        </div>
        {selectedGroup.places.some(isUnverified) && verifyBanner}
        <div className="space-y-3">
          {selectedGroup.places.map((p) => (
            <PlaceRow key={p.id} place={p} onHidden={handleHidden} />
          ))}
        </div>
      </div>
    )
  }

  // ── Level 1: 내 영상 리스트 ──
  return (
    <div>
      {modalOpen && <AddPlaceModal onSubmit={handleAdd} onClose={() => setModalOpen(false)} />}
      {addErrorBanner}
      <div className="flex items-center justify-between mb-3">
        <Link
          href="/partner/dashboard/places/extract"
          className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
        >
          + 영상으로 등록하기
        </Link>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition"
        >
          직접 입력
        </button>
      </div>

      {optimisticPlaces.some(isUnverified) && verifyBanner}

      <div className="space-y-2">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setSelectedKey(g.key)}
            className="w-full flex items-center gap-3 border rounded-lg px-4 py-3.5 hover:bg-gray-50 transition text-left"
          >
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${g.isUnlinked ? 'text-gray-500' : ''}`}>
                {g.label}
              </p>
              {g.unverifiedCount > 0 && (
                <p className="text-xs text-blue-600 font-medium mt-0.5">확인 {g.unverifiedCount}</p>
              )}
            </div>
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 shrink-0">
              {g.count}곳
            </span>
            <span className="text-gray-300 shrink-0 text-lg leading-none">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
