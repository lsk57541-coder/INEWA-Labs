import Link from 'next/link'
import GuideContent from '@/components/GuideContent'

export const metadata = {
  title: '사용법 | MAPTUBE',
}

export default function GuidePage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10">
      <Link href="/" className="text-blue-500 hover:underline text-sm">← 메인으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-1">MAPTUBE 사용법</h1>
      <p className="text-gray-400 text-sm mb-8">유튜버가 다녀온 그곳, 이렇게 찾아보세요</p>

      <GuideContent />
    </div>
  )
}
