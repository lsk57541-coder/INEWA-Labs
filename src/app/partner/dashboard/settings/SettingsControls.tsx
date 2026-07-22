'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateReportOptIn, withdrawPartner } from '../actions'

const CONTACT_HREF = 'mailto:inewalabs@gmail.com'

export default function SettingsControls({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn)
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // withdrawPartner는 성공 시 서버에서 redirect → 여기로 돌아오지 않는다. 반환된 {error}만 처리한다.
  // (Server Action throw message가 프로덕션서 가려지는 문제로, expected error를 키로 받아 배너 안내.)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

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

  const doWithdraw = () => {
    setWithdrawError(null)
    startTransition(async () => {
      const result = await withdrawPartner()
      if (result?.error) {
        setConfirmOpen(false)
        setWithdrawError(result.error)
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
        {withdrawError && <WithdrawErrorBanner errorKey={withdrawError} onRetry={doWithdraw} />}
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
                onClick={doWithdraw}
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

// 그룹B 컨벤션(인라인 빨간 텍스트 배너) + 케이스별 안내 액션. withdrawPartner가 반환한 키를 문구로 매핑.
function WithdrawErrorBanner({ errorKey, onRetry }: { errorKey: string; onRetry: () => void }) {
  const reload = () => window.location.reload()
  const MAP: Record<string, { text: string; actions: React.ReactNode }> = {
    is_demo: {
      text: '이 계정은 데모용이라 탈퇴할 수 없어요.',
      actions: <Link href="/partner/dashboard" className="underline font-medium">대시보드로</Link>,
    },
    login_expired: {
      text: '로그인이 만료됐어요. 다시 로그인해 주세요.',
      actions: <Link href="/login" className="underline font-medium">로그인</Link>,
    },
    no_partner: {
      text: '파트너 정보를 확인할 수 없어요. 계속되면 문의해 주세요.',
      actions: (
        <>
          <button onClick={reload} className="underline font-medium">새로고침</button>
          <a href={CONTACT_HREF} className="underline font-medium">문의</a>
        </>
      ),
    },
    withdraw_failed: {
      text: '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.',
      actions: (
        <>
          <button onClick={onRetry} className="underline font-medium">다시 시도</button>
          <a href={CONTACT_HREF} className="underline font-medium">문의</a>
        </>
      ),
    },
  }
  const entry = MAP[errorKey] ?? {
    text: '문제가 발생했어요. 다시 시도해 주세요.',
    actions: <button onClick={onRetry} className="underline font-medium">다시 시도</button>,
  }
  return (
    <div className="mt-3 text-xs text-red-600">
      <p>{entry.text}</p>
      <div className="mt-1 flex gap-3">{entry.actions}</div>
    </div>
  )
}
