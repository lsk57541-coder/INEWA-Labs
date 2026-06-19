'use client'

import { useState, useTransition } from 'react'

export default function PartnerReviewForm({
  approveAction,
  rejectAction,
}: {
  approveAction: (grade: string) => Promise<void>
  rejectAction: (reason: string) => Promise<void>
}) {
  const [grade, setGrade] = useState<'general' | 'premium'>('general')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleApprove = () => {
    setError(null)
    startTransition(() => approveAction(grade))
  }

  const handleReject = () => {
    if (!reason.trim()) {
      setError('거절 사유를 입력해주세요.')
      return
    }
    if (!window.confirm('이 신청을 거절할까요?')) return
    setError(null)
    startTransition(() => rejectAction(reason))
  }

  return (
    <div className="space-y-5">
      <div className="border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">승인</p>
        <div className="flex items-center gap-3 mb-3">
          {(['general', 'premium'] as const).map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="grade" checked={grade === g} onChange={() => setGrade(g)} />
              {g === 'general' ? '일반' : '프리미엄'}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={handleApprove}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
        >
          {pending ? '처리 중…' : '승인하기'}
        </button>
      </div>

      <div className="border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">거절</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="거절 사유를 입력해주세요 (신청자에게 이메일로 전달됩니다)"
          rows={3}
          className="w-full text-sm border rounded-lg px-3 py-2 mb-3 outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          type="button"
          disabled={pending}
          onClick={handleReject}
          className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition"
        >
          {pending ? '처리 중…' : '거절하기'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
