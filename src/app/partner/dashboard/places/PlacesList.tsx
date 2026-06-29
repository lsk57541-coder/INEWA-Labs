'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import PlaceRow, { type Place } from './PlaceRow'
import AddPlaceModal from './AddPlaceModal'
import { addPlace, type PlaceInput } from './actions'

type Action = { type: 'remove'; id: string } | { type: 'add'; place: Place }

export default function PlacesList({ places }: { places: Place[] }) {
  const [optimisticPlaces, applyOptimistic] = useOptimistic(places, (state: Place[], action: Action) => {
    if (action.type === 'remove') return state.filter((p) => p.id !== action.id)
    return [action.place, ...state]
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [, startTransition] = useTransition()

  const handleHidden = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ type: 'remove', id })
    })
  }

  const handleAdd = (data: PlaceInput) => {
    setModalOpen(false)
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
      await addPlace(data)
    })
  }

  return (
    <div>
      {modalOpen && <AddPlaceModal onSubmit={handleAdd} onClose={() => setModalOpen(false)} />}

      {optimisticPlaces.length === 0 ? (
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
      ) : (
        <div>
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
          {optimisticPlaces.some((p) => p.source === 'ai' && (p.verification_status ?? 'unverified') === 'unverified') && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-3">
              AI가 찾은 장소는 정확도 확인이 필요해요. 위쪽 장소부터 “맞아요/아니에요”로 확인해 주세요.
            </p>
          )}
          <div className="space-y-3">
            {optimisticPlaces.map((p) => (
              <PlaceRow key={p.id} place={p} onHidden={handleHidden} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
