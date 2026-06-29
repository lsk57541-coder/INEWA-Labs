'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replyInquiry } from '@/app/actions'

// 관리자 답장 입력/수정. 저장 시 reply/replied_at update — RLS "admin can update inquiries"로 통과.
export default function InquiryReplyForm({ id, reply, repliedAt }: { id: string; reply: string | null; repliedAt: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(reply ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = () => {
    if (!value.trim()) { setError('답장 내용을 입력해주세요.'); return }
    setError(null)
    startTransition(async () => {
      try {
        await replyInquiry(id, value)
        setSaved(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '답장 저장에 실패했어요.')
      }
    })
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="block text-xs font-medium text-gray-500 mb-1">
        답장
        {repliedAt && <span className="font-normal text-gray-400"> · {new Date(repliedAt).toLocaleString('ko-KR')}</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false) }}
        rows={3}
        placeholder="답장 내용을 입력하세요"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={save}
          disabled={pending || !value.trim()}
          className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
        >
          {pending ? '저장 중…' : reply ? '답장 수정' : '답장 저장'}
        </button>
        {saved && !pending && <span className="text-xs text-green-600">저장됐어요</span>}
      </div>
    </div>
  )
}
