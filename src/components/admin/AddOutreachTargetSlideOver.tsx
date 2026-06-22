'use client'

import { useRef, useState, useTransition } from 'react'

export default function AddOutreachTargetSlideOver({
  addAction,
}: {
  addAction: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await addAction(formData)
      formRef.current?.reset()
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition"
      >
        + 대상 추가
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-white h-full p-5 overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">아웃리치 대상 추가</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">
                닫기
              </button>
            </div>
            <form ref={formRef} action={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">채널명 *</label>
                <input name="channel_name" required className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500">유튜브 URL</label>
                <input name="youtube_url" className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500">연락처 이메일</label>
                <input name="contact_email" type="email" className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500">카테고리</label>
                <input name="category" placeholder="맛집 / 여행 / 지역 등" className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500">지역</label>
                <input name="region" className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500">메모</label>
                <textarea name="memo" rows={3} className="w-full text-sm border rounded-lg px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {pending ? '추가 중…' : '추가'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
