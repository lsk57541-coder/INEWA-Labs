'use client'

import { useState, useTransition } from 'react'

const STATUS_OPTIONS = [
  { value: 'pending', label: '대기' },
  { value: 'sent', label: '발송됨' },
  { value: 'followed_up', label: '팔로업됨' },
  { value: 'replied', label: '회신옴' },
  { value: 'converted', label: '전환됨' },
  { value: 'rejected', label: '거절됨' },
] as const

export default function OutreachTargetActions({
  status,
  templateNames,
  canFollowUp,
  sendAction,
  followUpAction,
  updateStatusAction,
}: {
  status: string
  templateNames: string[]
  canFollowUp: boolean
  sendAction: (templateName: string) => Promise<void>
  followUpAction: () => Promise<void>
  updateStatusAction: (status: typeof STATUS_OPTIONS[number]['value']) => Promise<void>
}) {
  const [template, setTemplate] = useState(templateNames[0] ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await action()
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {status === 'pending' && (
          <>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="text-xs border rounded px-1.5 py-1 bg-white"
            >
              {templateNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !template}
              onClick={() => run(() => sendAction(template))}
              className="text-xs bg-black text-white px-2.5 py-1 rounded hover:bg-gray-800 disabled:opacity-40 transition"
            >
              발송
            </button>
          </>
        )}
        {canFollowUp && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(followUpAction)}
            className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200 disabled:opacity-40 transition"
          >
            팔로업
          </button>
        )}
        <select
          value={status}
          disabled={pending}
          onChange={(e) => run(() => updateStatusAction(e.target.value as typeof STATUS_OPTIONS[number]['value']))}
          className="text-xs border rounded px-1.5 py-1 bg-white disabled:opacity-40"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
