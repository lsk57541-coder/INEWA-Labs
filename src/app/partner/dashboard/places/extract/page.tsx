import Link from 'next/link'
import { getMyPartner } from '../../actions'
import ExtractPlacesForm from '@/components/partner/ExtractPlacesForm'

export default async function ExtractPlacesPage() {
  await getMyPartner()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/partner/dashboard/places" className="text-xs text-gray-400 hover:text-gray-600">
          ← 장소 관리
        </Link>
      </div>
      <h1 className="text-xl font-bold mb-6">영상으로 장소 등록하기</h1>
      <ExtractPlacesForm />
    </div>
  )
}
