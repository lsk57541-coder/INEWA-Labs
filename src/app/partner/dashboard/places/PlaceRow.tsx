'use client'

import { useState, useTransition } from 'react'
import { updatePlace, hidePlace, deletePlace, confirmPlace, rejectPlace, type PlaceInput } from './actions'

export interface Place {
  id: string
  name: string
  address: string | null
  category: string | null
  video_url: string | null
  status: 'active' | 'reviewing' | 'hidden' | 'rejected' | 'deleted'
  click_count: number
  rejection_reason?: string | null
  verification_status?: 'unverified' | 'confirmed' | 'rejected' | null
  source?: 'coords' | 'timestamp' | 'ai' | 'list' | null
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
          className="flex-1 text-sm font-medium border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
        />
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[place.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {STATUS_LABEL[place.status] ?? place.status}
        </span>
      </div>

      <input
        value={fields.address}
        onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
        onBlur={() => saveField({ address: fields.address })}
        placeholder="주소"
        className="w-full text-xs text-gray-500 border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
      />

      <div className="flex gap-2">
        <input
          value={fields.category}
          onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))}
          onBlur={() => saveField({ category: fields.category })}
          placeholder="카테고리"
          className="flex-1 text-xs border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
        />
        <input
          value={fields.video_url}
          onChange={(e) => setFields((f) => ({ ...f, video_url: e.target.value }))}
          onBlur={() => saveField({ video_url: fields.video_url })}
          placeholder="연결 영상 URL"
          className="flex-1 text-xs border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
        />
      </div>

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
    </div>
  )
}
