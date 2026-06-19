'use client'

import { useTransition } from 'react'

export default function PartnerActionButtons({
  onApprove,
  onReject,
}: {
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex gap-2 shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(onApprove)}
        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40 transition"
      >
        승인
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(onReject)}
        className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 disabled:opacity-40 transition"
      >
        거절
      </button>
    </div>
  )
}
