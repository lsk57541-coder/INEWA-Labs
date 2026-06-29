import Link from 'next/link'

const TABS = [
  { key: '장소', href: '/admin', label: '장소' },
  { key: '파트너', href: '/admin/partners', label: '파트너' },
  { key: '검토', href: '/admin/places', label: '검토' },
  { key: '아웃리치', href: '/admin/outreach', label: '아웃리치' },
  { key: '문의', href: '/admin/inquiries', label: '문의' },
  { key: '영상등록', href: '/admin/locations/new/bulk', label: '영상등록' },
] as const

type TabKey = typeof TABS[number]['key']

export default function AdminTabNav({ active }: { active: TabKey }) {
  return (
    <div className="overflow-x-auto -mx-4 mb-6">
      <div className="flex min-w-max px-4 border-b">
        {TABS.map((tab) =>
          tab.key === active ? (
            <span
              key={tab.key}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-black border-b-2 border-black -mb-px shrink-0"
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.key}
              href={tab.href}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-400 border-b-2 border-transparent hover:text-gray-600 -mb-px shrink-0"
            >
              {tab.label}
            </Link>
          )
        )}
        <Link
          href="/admin/locations/new"
          className="inline-flex items-center px-3 py-2 text-sm font-semibold text-black border-b-2 border-transparent hover:text-gray-700 -mb-px shrink-0"
        >
          + 추가
        </Link>
      </div>
    </div>
  )
}
