'use client'

import { useState, useTransition } from 'react'
import { approvePlace, rejectPlace } from './actions'

interface AdminPlace {
  id: string
  name: string
  address: string | null
  category: string | null
  video_url: string | null
  status: string
  rejection_reason: string | null
  created_at: string
  partners: { channel_name: string } | null
}

export default function PlaceReviewList({ places }: { places: AdminPlace[] }) {
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleApprove = (id: string) => {
    setError(null)
    startTransition(async () => {
      try { await approvePlace(id) } catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    })
  }

  const handleReject = (id: string) => {
    const reason = reasonInputs[id] ?? ''
    setError(null)
    startTransition(async () => {
      try {
        await rejectPlace(id, reason)
        setRejectingId(null)
      } catch (e) { setError(e instanceof Error ? e.message : '처리 실패') }
    })
  }

  if (places.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-12">장소가 없습니다</p>
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {places.map(p => (
        <div key={p.id} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-gray-400">{p.partners?.channel_name ?? '알 수 없는 파트너'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              p.status === 'reviewing' ? 'bg-yellow-100 text-yellow-700'
              : p.status === 'active' ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
            }`}>
              {p.status === 'reviewing' ? '검토 중' : p.status === 'active' ? '승인됨' : '반려됨'}
            </span>
          </div>

          {p.address && <p className="text-xs text-gray-500">{p.address}</p>}
          {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
          {p.video_url && (
            <a href={p.video_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline line-clamp-1">
              {p.video_url}
            </a>
          )}
          {p.rejection_reason && (
            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">반려 사유: {p.rejection_reason}</p>
          )}

          {p.status === 'reviewing' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => handleApprove(p.id)}
                className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                승인
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)}
                className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40 transition"
              >
                반려
              </button>
            </div>
          )}

          {rejectingId === p.id && (
            <div className="flex gap-2">
              <input
                value={reasonInputs[p.id] ?? ''}
                onChange={e => setReasonInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="반려 사유 (선택)"
                className="flex-1 text-xs border rounded-lg px-3 py-2 outline-none focus:border-red-400"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => handleReject(p.id)}
                className="text-xs bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 disabled:opacity-40 transition shrink-0"
              >
                반려 확정
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
