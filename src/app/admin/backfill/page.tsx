import Link from 'next/link'
import BackfillPanel from './BackfillPanel'
import { getBackfillCounts } from './actions'

export default async function BackfillPage() {
  const counts = await getBackfillCounts()
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← 관리자</Link>
      <h1 className="text-xl font-bold mt-3 mb-1">카카오 상세정보 백필</h1>
      <p className="text-sm text-gray-500 mb-6">
        기존 장소를 카카오 재검색해 전화·상세(place id)·대분류를 채웁니다. 저장 좌표 <b>50m 이내</b>만 매칭(오매칭 방지),
        미매칭은 건너뜁니다(카드에선 좌표 딥링크로 폴백). 이미 채워진 행은 건너뜁니다(멱등). 100건씩, 남을 때까지 반복 클릭하세요.
      </p>
      <BackfillPanel initial={counts} />
    </div>
  )
}
