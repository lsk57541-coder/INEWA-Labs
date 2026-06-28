'use client'

import type { ReactNode } from 'react'

// 위치/채널 검색결과를 네이버·카카오식 풀스크린 리스트로 보여주는 공용 모달.
// 위치·채널이 renderItem만 다르게 재사용한다. (FavoritesOverlay 풀스크린 패턴 차용)
interface SearchResultModalProps<T> {
  open: boolean
  onClose: () => void
  query: string
  loading: boolean
  items: T[]
  keyOf: (item: T) => string
  renderItem: (item: T) => ReactNode
  onSelect: (item: T) => void
  emptyText?: string
}

export default function SearchResultModal<T>({
  open,
  onClose,
  query,
  loading,
  items,
  keyOf,
  renderItem,
  onSelect,
  emptyText = '검색 결과가 없습니다.',
}: SearchResultModalProps<T>) {
  if (!open) return null

  return (
    // 백드롭(클릭 시 닫힘) + 화면 중앙 카드
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 검색어 + 결과 개수 + ✕ 닫기 */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
          <p className="font-bold text-gray-900 truncate flex-1 min-w-0">
            {query ? `"${query}" ` : ''}검색결과 {items.length}개
          </p>
          <button onClick={onClose} aria-label="닫기" className="text-2xl text-gray-500 leading-none px-1 shrink-0">✕</button>
        </div>

        {/* 본문: 결과 리스트(내부 스크롤) */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">검색 중…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">{emptyText}</p>
          ) : (
            items.map((item) => (
              <button
                key={keyOf(item)}
                onClick={() => { onSelect(item); onClose() }}
                className="w-full text-left px-4 py-3.5 border-b border-border last:border-0 hover:bg-gray-50 active:bg-gray-100 transition"
              >
                {renderItem(item)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
