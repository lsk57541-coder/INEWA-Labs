'use client'

import { useState, useTransition } from 'react'
import { updateReportOptIn, withdrawPartner } from '../actions'

export default function SettingsControls({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn)
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const toggleOptIn = () => {
    const next = !optIn
    setOptIn(next)
    startTransition(async () => {
      try {
        await updateReportOptIn(next)
      } catch {
        setOptIn(!next)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">월간 리포트 이메일 수신</p>
          <p className="text-xs text-gray-400 mt-0.5">매달 1일 클릭/장소 통계를 이메일로 받습니다.</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={toggleOptIn}
          className={`shrink-0 w-12 h-7 rounded-full transition relative disabled:opacity-40 ${optIn ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${optIn ? 'translate-x-5' : ''}`}
          />
        </button>
      </div>

      <div className="border border-red-200 rounded-lg p-4">
        <p className="text-sm font-medium text-red-600 mb-1">파트너 탈퇴</p>
        <p className="text-xs text-gray-400 mb-3">탈퇴 시 등록한 장소가 모두 비공개로 전환되고 대시보드 접근이 제한됩니다.</p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition"
        >
          파트너 탈퇴하기
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold mb-2">정말 탈퇴하시겠어요?</p>
            <p className="text-xs text-gray-500 mb-4">이 작업은 되돌릴 수 없으며, 등록한 장소가 모두 비공개로 전환됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg py-2 font-medium transition"
              >
                취소
              </button>
              <button
                disabled={pending}
                onClick={() => startTransition(() => withdrawPartner())}
                className="flex-1 text-sm bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 disabled:opacity-40 transition"
              >
                {pending ? '처리 중…' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
