'use client'

import { useState, useTransition } from 'react'
import { updatePlace, hidePlace, type PlaceInput } from './actions'

export interface Place {
  id: string
  name: string
  address: string | null
  category: string | null
  video_url: string | null
  status: 'active' | 'reviewing' | 'hidden'
  click_count: number
}

const STATUS_LABEL: Record<string, string> = {
  active: '지도 표시 중',
  reviewing: '검토 중',
  hidden: '비공개',
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

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={fields.name}
          onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
          onBlur={() => saveField({ name: fields.name })}
          className="flex-1 text-sm font-medium border-b border-transparent hover:border-gray-200 focus:border-blue-400 outline-none px-1 py-0.5"
        />
        <span className="text-xs text-gray-400 shrink-0">{STATUS_LABEL[place.status]}</span>
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

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-400">클릭 {place.click_count.toLocaleString()}회</span>
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
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
