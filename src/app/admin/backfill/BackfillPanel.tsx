'use client'

import { useState } from 'react'
import { backfillKakaoBatch, getBackfillCounts, type BackfillCounts, type BackfillResult, type BackfillTable } from './actions'

export default function BackfillPanel({ initial }: { initial: BackfillCounts }) {
  const [counts, setCounts] = useState(initial)
  const [running, setRunning] = useState<BackfillTable | null>(null)
  const [last, setLast] = useState<BackfillResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (table: BackfillTable) => {
    setRunning(table)
    setError(null)
    try {
      const r = await backfillKakaoBatch(table, 100)
      setLast(r)
      setCounts(await getBackfillCounts())
    } catch (e) {
      setError(e instanceof Error ? e.message : '백필에 실패했어요')
    } finally {
      setRunning(null)
    }
  }

  const Card = ({ table, label }: { table: BackfillTable; label: string }) => {
    const c = counts[table]
    return (
      <div className="border rounded-lg p-4">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-sm text-gray-500 mt-1">채워짐 {c.backfilled} · 남음 {c.remaining}</p>
        <button
          type="button"
          onClick={() => run(table)}
          disabled={running !== null || c.remaining === 0}
          className="mt-3 text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition"
        >
          {running === table ? '처리 중…' : c.remaining === 0 ? '완료' : '100건 백필'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Card table="places" label="places (파트너 셀프등록)" />
      <Card table="locations" label="locations (관리자 큐레이션 · 제주 데모)" />
      {last && (
        <div className="text-sm bg-gray-50 border rounded-lg p-3">
          <p className="font-medium">{last.table} 배치 결과</p>
          <p className="text-gray-600 mt-0.5">
            처리 {last.processed} · 매칭 {last.matched} · 스킵 {last.skipped} · 남음 {last.remaining}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
