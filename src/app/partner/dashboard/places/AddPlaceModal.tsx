'use client'

import { useState } from 'react'
import type { PlaceInput } from './actions'

export default function AddPlaceModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (data: PlaceInput) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [category, setCategory] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

  const handleSubmit = () => {
    if (!name.trim()) return
    onSubmit({ name, address, category, video_url: videoUrl })
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold mb-3">장소 추가</p>
        <div className="space-y-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="상호명 *"
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="주소"
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="카테고리"
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="연결 영상 URL"
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg py-2 font-medium transition">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="flex-1 text-sm bg-black text-white rounded-lg py-2 font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
