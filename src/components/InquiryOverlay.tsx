'use client'

import { useState, useEffect, useCallback } from 'react'
import { submitInquiry, getMyInquiries, type Inquiry } from '@/app/actions'

interface InquiryOverlayProps {
  open: boolean
  onClose: () => void
}

type Tab = 'write' | 'history'

// 문의하기 오버레이. GuideOverlay와 같은 딤/닫기 톤(모바일 바텀시트 / PC 중앙모달).
// 탭1 문의 작성(제목·내용 — 신원은 로그인 user_id로 식별, 이메일 칸 없음) / 탭2 내 문의 내역(답장 확인).
export default function InquiryOverlay({ open, onClose }: InquiryOverlayProps) {
  const [tab, setTab] = useState<Tab>('write')

  // 탭1: 작성 폼
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 탭2: 내 문의 내역
  const [items, setItems] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setHistoryError(null)
    try {
      setItems(await getMyInquiries())  // RLS "select own inquiry"로 본인 문의만
    } catch {
      setHistoryError('내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  // 내역 탭이 열릴 때마다 최신 조회
  useEffect(() => {
    if (open && tab === 'history') loadHistory()
  }, [open, tab, loadHistory])

  if (!open) return null

  const close = () => {
    // 닫을 때 초기화(다음에 깨끗하게 열리도록)
    setTab('write')
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
      <div className="w-full bg-warm rounded-t-2xl max-h-[85dvh] flex flex-col shadow-2xl md:max-w-lg md:rounded-2xl md:max-h-[80dvh]">
        {/* 모바일 드래그 핸들 바 */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
          <span className="font-bold text-ink">문의하기</span>
          <button
            onClick={close}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface text-ink-muted transition"
          >
            ✕
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-line shrink-0">
          {([['write', '문의하기'], ['history', '내 문의 내역']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                tab === key ? 'border-coral text-coral' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-5 py-5">
          {tab === 'write' ? (
            done ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">✓</p>
                <p className="font-medium mb-1">문의가 접수됐어요.</p>
                <p className="text-sm text-gray-500">확인 후 반영할게요.</p>
                <button
                  onClick={() => { setTitle(''); setContent(''); setDone(false); setTab('history') }}
                  className="mt-6 text-sm bg-coral text-white rounded-lg px-5 py-2.5 hover:brightness-95 transition"
                >
                  내 문의 내역 보기
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1">제목</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="문의 제목"
                    maxLength={100}
                    className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1">내용</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="어떤 점이 궁금하거나 불편하셨나요? 장소 오류라면 어떤 장소인지 함께 적어주시면 도움이 돼요."
                    rows={6}
                    maxLength={2000}
                    className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/40 resize-none"
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !content.trim()}
                  className="w-full bg-coral text-white text-sm font-medium py-3 rounded-lg hover:brightness-95 disabled:opacity-40 transition"
                >
                  {submitting ? '접수 중…' : '문의 보내기'}
                </button>
              </div>
            )
          ) : (
            // 탭2: 내 문의 내역
            loading ? (
              <p className="text-center text-sm text-gray-400 py-10">불러오는 중…</p>
            ) : historyError ? (
              <p className="text-center text-sm text-red-600 py-10">{historyError}</p>
            ) : items.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">아직 보낸 문의가 없어요.</p>
            ) : (
              <div className="space-y-3">
                {items.map((q) => (
                  <div key={q.id} className="border border-line rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-ink flex-1 min-w-0">{q.title}</span>
                      {q.reply ? (
                        <span className="shrink-0 text-[10px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5">답변 완료</span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">확인 중</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-1.5">{new Date(q.created_at).toLocaleString('ko-KR')}</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{q.content}</p>

                    {q.reply ? (
                      <div className="mt-2.5 border-t border-gray-100 pt-2.5">
                        <div className="bg-coral-soft rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-coral mb-1">답변</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.reply}</p>
                          {q.replied_at && (
                            <p className="text-[10px] text-gray-400 mt-1.5">{new Date(q.replied_at).toLocaleString('ko-KR')}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400">아직 확인 중이에요. 조금만 기다려 주세요.</p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
