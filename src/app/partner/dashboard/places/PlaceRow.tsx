'use client'

import { useState, useTransition } from 'react'
import { updatePlace, hidePlace, unhidePlace, deletePlace, confirmPlace, rejectPlace, type PlaceInput } from './actions'
import PlaceSearchModal, { type PlaceSearchResult } from '@/components/partner/PlaceSearchModal'

export interface Place {
  id: string
  name: string
  address: string | null
  category: string | null
  video_url: string | null
  status: 'active' | 'reviewing' | 'hidden' | 'rejected' | 'deleted'
  click_count: number
  latitude?: number | null
  longitude?: number | null
  rejection_reason?: string | null
  verification_status?: 'unverified' | 'confirmed' | 'rejected' | null
  source?: 'coords' | 'timestamp' | 'ai' | 'list' | null
  video_title?: string | null  // 영상별 그룹 헤더 라벨용(없으면 대표 장소명 폴백)
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  reviewing: 'bg-yellow-100 text-yellow-700',
  hidden: 'bg-gray-100 text-gray-500',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<string, string> = {
  active: '지도 표시 중',
  reviewing: '검토 중',
  hidden: '비공개',
  rejected: '반려됨',
}

export default function PlaceRow({ place, onHidden }: { place: Place; onHidden: (id: string) => void }) {
  const [fields, setFields] = useState<PlaceInput>({
    name: place.name,
    address: place.address ?? '',
    category: place.category ?? '',
    video_url: place.video_url ?? '',
  })
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // 좌표는 편집 input이 아니라 검색 모달로만 채운다. 채운 뒤 즉시 뱃지가 바뀌게 로컬 상태로 추적.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    place.latitude != null && place.longitude != null ? { lat: place.latitude, lng: place.longitude } : null,
  )
  const [searchOpen, setSearchOpen] = useState(false)
  // 좌표대기 = 공개(active) 상태인데 좌표가 없어 실제로는 지도에 안 뜨는 장소.
  const isCoordPending = place.status === 'active' && coords === null

  const saveField = (patch: Partial<PlaceInput>) => {
    setError(null)
    startTransition(async () => {
      try {
        await updatePlace(place.id, patch)
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패')
      }
    })
  }

  // 좌표 채우기 — 검색 결과 선택 시 좌표 저장(+주소/카테고리는 비어있을 때만 보정, 상호명은 유지).
  // status는 그대로 active → 좌표가 채워지는 순간 노출 조건(active+좌표)을 만족해 지도에 뜬다.
  const handleSelectPlace = (r: PlaceSearchResult) => {
    setSearchOpen(false)
    setError(null)
    const patch: Partial<PlaceInput> = { latitude: r.lat, longitude: r.lng }
    // 좌표를 채우는 카카오 장소가 권위 소스 → phone/place id/대분류도 함께 저장(있을 때만).
    if (r.phone) patch.phone = r.phone
    if (r.kakaoPlaceId) patch.kakao_place_id = r.kakaoPlaceId
    if (r.categoryGroupCode) patch.category_group_code = r.categoryGroupCode
    const next = { ...fields }
    if (!fields.address?.trim() && r.address) { patch.address = r.address; next.address = r.address }
    if (!fields.category?.trim() && r.category) {
      const cat = r.category.split('>').pop()?.trim()
      if (cat) { patch.category = cat; next.category = cat }
    }
    setFields(next)
    setCoords({ lat: r.lat, lng: r.lng })
    startTransition(async () => {
      try {
        await updatePlace(place.id, patch)
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패')
        setCoords(null) // 실패 시 뱃지 원복(실제 저장 안 됐으므로)
      }
    })
  }

  const handleHide = () => {
    if (!window.confirm(`"${place.name}"을 비공개 처리할까요?`)) return
    onHidden(place.id)
    startTransition(async () => {
      try {
        await hidePlace(place.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리 실패')
      }
    })
  }

  // 공개로 전환(일반 비공개 복원) — prev_status로 되돌림(서버). 비공개 탭에서 낙관적 제거.
  const handleUnhide = () => {
    onHidden(place.id) // 복원되면 비공개 탭 목록에서 빠짐(hide/reject와 동일 패턴)
    startTransition(async () => {
      try {
        await unhidePlace(place.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리 실패')
      }
    })
  }

  const handleDelete = () => {
    if (!window.confirm(`"${place.name}"을(를) 삭제할까요?\n삭제하면 목록에서 사라집니다. 되돌리려면 관리자에게 문의해야 해요.`)) return
    onHidden(place.id) // 삭제되므로 목록에서 낙관적 제거(hide/reject와 동일 패턴)
    startTransition(async () => {
      try {
        await deletePlace(place.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '삭제 실패')
      }
    })
  }

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        await confirmPlace(place.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '확인 처리 실패')
      }
    })
  }

  const handleReject = () => {
    if (!window.confirm(`"${place.name}"이(가) 잘못된 장소인가요?\n검색·지도에서 숨김 처리됩니다.`)) return
    onHidden(place.id) // 숨김되므로 목록에서 낙관적 제거(비공개 처리와 동일)
    startTransition(async () => {
      try {
        await rejectPlace(place.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리 실패')
      }
    })
  }

  const isAiUnverified = place.source === 'ai' && (place.verification_status ?? 'unverified') === 'unverified'

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={fields.name}
          onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
          onBlur={() => saveField({ name: fields.name })}
          className="flex-1 text-sm font-medium border border-gray-200 rounded-lg bg-white px-2.5 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${isCoordPending ? 'bg-amber-100 text-amber-700' : (STATUS_BADGE[place.status] ?? 'bg-gray-100 text-gray-500')}`}>
          {isCoordPending ? '좌표대기' : (STATUS_LABEL[place.status] ?? place.status)}
        </span>
      </div>

      <input
        value={fields.address}
        onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
        onBlur={() => saveField({ address: fields.address })}
        placeholder="주소"
        className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg bg-white px-2.5 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
      />

      <div className="flex gap-2">
        <input
          value={fields.category}
          onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))}
          onBlur={() => saveField({ category: fields.category })}
          placeholder="카테고리"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg bg-white px-2.5 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
        <input
          value={fields.video_url}
          onChange={(e) => setFields((f) => ({ ...f, video_url: e.target.value }))}
          onBlur={() => saveField({ video_url: fields.video_url })}
          placeholder="연결 영상 URL"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg bg-white px-2.5 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
      </div>
      {/* 긴 URL을 늘어놓는 대신 실제 영상을 여는 액션(Notion/Airbnb식). URL 편집칸은 위에 그대로 유지. */}
      {/^https?:\/\//.test((fields.video_url ?? '').trim()) && (
        <a
          href={(fields.video_url ?? '').trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          ▶ 영상 보기
        </a>
      )}

      {/* 좌표대기 — 상호명만 있고 좌표가 없어 지도에 안 뜨는 장소. 좌표를 채우면 즉시 노출된다. */}
      {isCoordPending && (
        <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-2.5 py-2">
          <span className="text-xs text-amber-700 flex-1">
            좌표가 없어 지도에 표시되지 않아요. 좌표를 채우면 바로 노출됩니다.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setSearchOpen(true)}
            className="shrink-0 text-xs font-medium bg-black text-white px-2.5 py-1 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
          >
            좌표 채우기
          </button>
        </div>
      )}

      {/* 검증 — AI가 찾은 미검증 장소는 확인 유도, 확인/거부 결과는 상태로 표시 */}
      {isAiUnverified ? (
        <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-2.5 py-2">
          <span className="text-xs text-blue-700 flex-1">AI가 찾은 장소예요. 정확한가요?</span>
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirm}
            className="text-xs font-medium bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
          >
            맞아요
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleReject}
            className="text-xs font-medium bg-white text-gray-600 border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
          >
            아니에요
          </button>
        </div>
      ) : place.verification_status === 'confirmed' ? (
        // 정정 가능: 확인됨 → "아니에요로 변경"(reject 재사용). 번복 기록은 verification_logs에 append됨.
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 flex-1">✓ 확인됨</span>
          <button
            type="button"
            disabled={pending}
            onClick={handleReject}
            className="text-xs font-medium bg-white text-gray-600 border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
          >
            아니에요로 변경
          </button>
        </div>
      ) : place.verification_status === 'rejected' ? (
        // 정정 가능: 아니에요(숨김) → "맞아요로 변경"(confirm 재사용 → status도 active로 복원).
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 flex-1">✗ 아니에요 (숨김 처리됨)</span>
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirm}
            className="text-xs font-medium bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
          >
            맞아요로 변경
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-400">클릭 {place.click_count.toLocaleString()}회</span>
        <div className="flex items-center gap-3">
          {place.status !== 'hidden' && (
            <button
              type="button"
              disabled={pending}
              onClick={handleHide}
              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-40 transition"
            >
              비공개 처리
            </button>
          )}
          {/* 공개로 전환(일반 비공개 복원) — reject로 숨긴 건 위 "맞아요로 변경"이 담당하므로 제외. */}
          {place.status === 'hidden' && place.verification_status !== 'rejected' && (
            <button
              type="button"
              disabled={pending}
              onClick={handleUnhide}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 transition"
            >
              공개로 전환
            </button>
          )}
          {/* 삭제 — 비공개(일시)와 구분되게 더 약한 회색. 잘못 등록한 장소 제거용. */}
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="text-xs text-gray-300 hover:text-red-600 disabled:opacity-40 transition"
          >
            삭제
          </button>
        </div>
      </div>
      {place.status === 'rejected' && place.rejection_reason && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
          반려 사유: {place.rejection_reason}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {searchOpen && (
        <PlaceSearchModal
          initialQuery={fields.name || place.name}
          onSelect={handleSelectPlace}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
