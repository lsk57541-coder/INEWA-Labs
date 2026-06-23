import Link from 'next/link'

export default function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      <div className="mt-4">{children}</div>
    </div>
  )
}
