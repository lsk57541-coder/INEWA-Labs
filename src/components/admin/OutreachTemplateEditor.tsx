'use client'

import { useMemo, useState, useTransition } from 'react'
import { substituteTemplate } from '@/lib/outreachTemplate'

const PREVIEW_VARS = { 채널명: '맛집탐방 채널', 카테고리: '맛집', 지역: '서울' }

export default function OutreachTemplateEditor({
  name,
  initialSubject,
  initialBody,
  updateAction,
}: {
  name: string
  initialSubject: string
  initialBody: string
  updateAction: (subject: string, body: string) => Promise<void>
}) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const previewSubject = useMemo(() => substituteTemplate(subject, PREVIEW_VARS), [subject])
  const previewBody = useMemo(() => substituteTemplate(body, PREVIEW_VARS), [body])

  const handleSave = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateAction(subject, body)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      }
    })
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <p className="text-sm font-bold px-4 py-2 bg-gray-50 border-b">{name}</p>
      <div className="grid md:grid-cols-2 gap-4 p-4">
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="제목"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300 font-mono"
            placeholder="본문 ({{채널명}}, {{카테고리}}, {{지역}} 사용 가능)"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleSave}
              className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {pending ? '저장 중…' : '저장'}
            </button>
            {saved && <span className="text-xs text-green-600">저장됨</span>}
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">미리보기</p>
          <div className="border rounded-lg p-3 bg-gray-50 text-sm">
            <p className="font-medium mb-2">{previewSubject}</p>
            <div className="whitespace-pre-wrap text-gray-700">{previewBody}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
