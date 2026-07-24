'use client'

import { useState, useTransition } from 'react'
import PlaceSearchModal, { type PlaceSearchResult } from '@/components/partner/PlaceSearchModal'
import { approveCorrection, rejectCorrection } from './actions'

export interface CorrectionItem {
  reportId: string
  videoId: string
  reportLat: number
  reportLng: number
  suggestedAddress: string | null
  createdAt: string
  activeCorrection: { lat: number; lng: number; address: string | null; placeName: string | null } | null
  otherPendingCount: number
}

export default function CorrectionReviewList({ items }: { items: CorrectionItem[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [searchFor, setSearchFor] = useState<CorrectionItem | null>(null) // 승인 좌표 선택 중인 항목
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  // 낙관적 제거: 처리 성공하면 목록에서 빼서 즉시 갱신(서버 revalidate와 별개로 반응성 확보).
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const visible = items.filter((it) => !doneIds.has(it.reportId))

  const markDone = (reportId: string) => setDoneIds((prev) => new Set(prev).add(reportId))

  const handleApprovePick = (item: CorrectionItem, r: PlaceSearchResult) => {
    setSearchFor(null)
    setError(null)
    startTransition(async () => {
      try {
        const res = await approveCorrection({
          reportId: item.reportId,
          videoId: item.videoId,
          lat: r.lat,
          lng: r.lng,
          address: r.address,
          placeName: r.name || null,
          note: notes[item.reportId] || null,
        })
        if (res?.error) setError(res.error)
        else markDone(item.reportId)
      } catch {
        setError('처리 실패')
      }
    })
  }

  const handleReject = (item: CorrectionItem) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await rejectCorrection({
          reportId: item.reportId,
          videoId: item.videoId,
          note: notes[item.reportId] || null,
        })
        if (res?.error) setError(res.error)
        else { setRejectingId(null); markDone(item.reportId) }
      } catch {
        setError('처리 실패')
      }
    })
  }

  if (visible.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-12">처리할 신고가 없어요.</p>
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {visible.map((it) => (
        <div key={it.reportId} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a
                href={`https://www.youtube.com/watch?v=${it.videoId}`}
                target="_blank" rel="noreferrer"
                className="font-mono text-xs text-blue-600 hover:underline break-all"
              >
                {it.videoId}
              </a>
              <p className="text-xs text-gray-400">{new Date(it.createdAt).toLocaleString('ko-KR')}</p>
            </div>
            {it.otherPendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-yellow-100 text-yellow-700">
                같은 영상 대기 {it.otherPendingCount}건 더
              </span>
            )}
          </div>

          <div className="text-xs text-gray-600 space-y-0.5">
            <p>신고 좌표: {it.reportLat.toFixed(5)}, {it.reportLng.toFixed(5)}</p>
            {it.suggestedAddress && <p>신고자 제안: {it.suggestedAddress}</p>}
            <p className="text-gray-400">
              현재 활성 보정: {it.activeCorrection
                ? `${it.activeCorrection.placeName ?? ''} ${it.activeCorrection.address ?? ''} (${it.activeCorrection.lat.toFixed(5)}, ${it.activeCorrection.lng.toFixed(5)})`.trim()
                : '없음(원본 위치 사용 중)'}
            </p>
          </div>

          <input
            value={notes[it.reportId] ?? ''}
            onChange={(e) => setNotes((prev) => ({ ...prev, [it.reportId]: e.target.value }))}
            placeholder="검토 메모 (선택)"
            className="w-full text-xs border rounded-lg px-3 py-2 outline-none focus:border-gray-400"
          />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => setSearchFor(it)}
              className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              승인 (장소 선택)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => (rejectingId === it.reportId ? handleReject(it) : setRejectingId(it.reportId))}
              className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40 transition"
            >
              {rejectingId === it.reportId ? '기각 확정' : '기각'}
            </button>
          </div>
        </div>
      ))}

      {searchFor && (
        <PlaceSearchModal
          initialQuery={searchFor.suggestedAddress ?? ''}
          onSelect={(r) => handleApprovePick(searchFor, r)}
          onClose={() => setSearchFor(null)}
        />
      )}
    </div>
  )
}
