'use client'

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
    <div className="relative">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mb-4 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
      >
        + 장소 수동 추가
      </button>

      {modalOpen && <AddPlaceModal onSubmit={handleAdd} onClose={() => setModalOpen(false)} />}

      {optimisticPlaces.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">등록된 장소가 없습니다</p>
      ) : (
        <div className="space-y-3">
          {optimisticPlaces.map((p) => (
            <PlaceRow key={p.id} place={p} onHidden={handleHidden} />
          ))}
        </div>
      )}
    </div>
  )
}
