'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setInquiryStatus } from '@/app/actions'

// 관리자 읽음/안읽음 토글. RLS "admin can update inquiries"로 통과.
export default function InquiryStatusToggle({ id, status }: { id: string; status: 'unread' | 'read' }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  const next = status === 'unread' ? 'read' : 'unread'
  const toggle = () => {
    setError(false)
    startTransition(async () => {
      try {
        await setInquiryStatus(id, next)
        router.refresh()
      } catch {
        setError(true)
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium disabled:opacity-40 ${
        status === 'unread'
          ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
          : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
      }`}
      title={status === 'unread' ? '읽음으로 표시' : '안읽음으로 표시'}
    >
      {pending ? '…' : error ? '실패' : status === 'unread' ? '안읽음' : '읽음'}
    </button>
  )
}
