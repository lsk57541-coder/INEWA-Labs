import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const TABS = [
  { key: '장소', href: '/admin', label: '장소' },
  { key: '파트너', href: '/admin/partners', label: '파트너' },
  { key: '검토', href: '/admin/places', label: '검토' },
  { key: '위치보정', href: '/admin/corrections', label: '위치보정' },
  { key: '아웃리치', href: '/admin/outreach', label: '아웃리치' },
  { key: '문의', href: '/admin/inquiries', label: '문의' },
  { key: '영상등록', href: '/admin/locations/new/bulk', label: '영상등록' },
] as const

type TabKey = typeof TABS[number]['key']

export default async function AdminTabNav({ active }: { active: TabKey }) {
  // 미답변 문의 수(reply IS NULL) — admin RLS로 전역 집계. 실패해도 0(뱃지 숨김)으로 폴백.
  // 모든 admin 페이지(viewer=admin)에서 렌더되므로 다른 탭을 보다가도 미답변이 눈에 띈다.
  const supabase = await createClient()
  const { count } = await supabase
    .from('inquiries').select('id', { count: 'exact', head: true }).is('reply', null)
  const pending = count ?? 0

  const badgeFor = (key: TabKey) =>
    key === '문의' && pending > 0 ? (
      <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
        {pending}
      </span>
    ) : null

  return (
    <div className="overflow-x-auto -mx-4 mb-6">
      <div className="flex min-w-max px-4 border-b">
        {TABS.map((tab) =>
          tab.key === active ? (
            <span
              key={tab.key}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-black border-b-2 border-black -mb-px shrink-0"
            >
              {tab.label}{badgeFor(tab.key)}
            </span>
          ) : (
            <Link
              key={tab.key}
              href={tab.href}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-400 border-b-2 border-transparent hover:text-gray-600 -mb-px shrink-0"
            >
              {tab.label}{badgeFor(tab.key)}
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
