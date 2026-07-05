import Link from 'next/link'
import { getMyVideoCoverage } from './actions'
import CoverageList from './CoverageList'

export default async function CoveragePage() {
  const videos = await getMyVideoCoverage()

  return (
    <div>
      <Link href="/partner/dashboard" className="text-xs text-gray-400 hover:text-gray-600">← 대시보드</Link>
      <h1 className="text-xl font-bold mt-3 mb-1">영상 커버리지</h1>
      <p className="text-xs text-gray-400 mb-5">
        내 채널 영상별로 등록된 장소와 지도 노출 상태를 확인하고 보완하세요. 장소가 없는 영상도 함께 보여요.
      </p>
      <CoverageList videos={videos} />
    </div>
  )
}
