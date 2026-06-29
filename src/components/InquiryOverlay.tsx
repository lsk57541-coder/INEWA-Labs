'use client'

import { useState } from 'react'
import { submitInquiry } from '@/app/actions'

interface InquiryOverlayProps {
  open: boolean
  onClose: () => void
}

// 문의하기 오버레이. GuideOverlay와 같은 딤/닫기 톤(모바일 바텀시트 / PC 중앙모달).
// 신원은 로그인 user_id로 식별하므로 이메일 칸 없음(제목·내용만).
export default function InquiryOverlay({ open, onClose }: InquiryOverlayProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const close = () => {
    // 닫을 때 폼 초기화(다음에 깨끗하게 열리도록)
    setTitle('')
    setContent('')
    setError(null)
    setDone(false)
    setSubmitting(false)
    onClose()
  }

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 모두 입력해주세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitInquiry({ title, content })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40 md:items-center md:justify-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="w-full bg-white rounded-t-2xl max-h-[85dvh] flex flex-col shadow-2xl md:max-w-lg md:rounded-2xl md:max-h-[80dvh]">
        {/* 모바일 드래그 핸들 바 */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-gray-200 shrink-0">
          <span className="font-bold">문의하기</span>
          <button
            onClick={close}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-5 py-5">
          {done ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-medium mb-1">문의가 접수됐어요.</p>
              <p className="text-sm text-gray-500">확인 후 반영할게요.</p>
              <button
                onClick={close}
                className="mt-6 text-sm bg-black text-white rounded-lg px-5 py-2.5 hover:bg-gray-800 transition"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문의 제목"
                  maxLength={100}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="어떤 점이 궁금하거나 불편하셨나요? 장소 오류라면 어떤 장소인지 함께 적어주시면 도움이 돼요."
                  rows={6}
                  maxLength={2000}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !content.trim()}
                className="w-full bg-black text-white text-sm font-medium py-3 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
              >
                {submitting ? '접수 중…' : '문의 보내기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
