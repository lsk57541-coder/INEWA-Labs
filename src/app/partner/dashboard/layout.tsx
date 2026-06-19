import Link from 'next/link'

export default function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      <nav className="flex gap-1.5 mt-2 mb-6">
        <Link href="/partner/dashboard" className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium">홈</Link>
        <Link href="/partner/dashboard/places" className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium">장소 관리</Link>
        <Link href="/partner/dashboard/settings" className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium">설정</Link>
      </nav>
      {children}
    </div>
  )
}
