import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTargets, getTemplates, addTarget, sendOutreach, sendFollowUp, updateStatus } from './actions'
import AdminTabNav from '@/components/admin/AdminTabNav'
import AddOutreachTargetSlideOver from '@/components/admin/AddOutreachTargetSlideOver'
import OutreachTargetActions from '@/components/admin/OutreachTargetActions'

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  sent: '발송됨',
  followed_up: '팔로업됨',
  replied: '회신옴',
  converted: '전환됨',
  rejected: '거절됨',
}

const TABS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'sent', label: '발송됨' },
  { key: 'followed_up', label: '팔로업됨' },
  { key: 'replied', label: '회신옴' },
  { key: 'converted', label: '전환됨' },
  { key: 'rejected', label: '거절됨' },
] as const

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { status, q } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const allTargets = await getTargets()
  const templates = await getTemplates()
  const templateNames = templates.map((t) => t.name)

  const now = new Date().getTime()
  let filtered = status ? allTargets.filter((t) => t.status === status) : allTargets
  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    filtered = filtered.filter((t) =>
      t.channel_name.toLowerCase().includes(needle) ||
      (t.category ?? '').toLowerCase().includes(needle) ||
      (t.region ?? '').toLowerCase().includes(needle)
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-3">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      </div>
      <AdminTabNav active="아웃리치" />
      <div className="flex items-center gap-2 mb-4 justify-end">
        <Link
          href="/admin/outreach/templates"
          className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-200 transition"
        >
          템플릿 관리
        </Link>
        <AddOutreachTargetSlideOver addAction={addTarget} />
      </div>

      <form className="flex gap-2 my-4" action="/admin/outreach">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="채널명/카테고리/지역 검색"
          className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button type="submit" className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition">
          검색
        </button>
      </form>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={{ pathname: '/admin/outreach', query: { ...(t.key && { status: t.key }), ...(q && { q }) } }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
              (status ?? '') === t.key
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>아웃리치 대상이 없습니다</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 text-left bg-gray-50">
                <th className="px-3 py-2">채널명</th>
                <th className="px-3 py-2">카테고리</th>
                <th className="px-3 py-2">지역</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">발송일</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const overdue =
                  t.status === 'sent' && t.sent_at && now - new Date(t.sent_at).getTime() >= SEVEN_DAYS_MS
                return (
                  <tr key={t.id} className={`border-t ${overdue ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-2">
                      {t.youtube_url ? (
                        <a href={t.youtube_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {t.channel_name}
                        </a>
                      ) : (
                        t.channel_name
                      )}
                      {overdue && <p className="text-xs text-amber-600 mt-0.5">7일째 미응답</p>}
                    </td>
                    <td className="px-3 py-2">{t.category ?? '-'}</td>
                    <td className="px-3 py-2">{t.region ?? '-'}</td>
                    <td className="px-3 py-2">{t.contact_email ?? '-'}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[t.status] ?? t.status}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.sent_at ? new Date(t.sent_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <OutreachTargetActions
                        status={t.status}
                        templateNames={templateNames}
                        canFollowUp={Boolean(overdue) && !t.followed_up_at}
                        sendAction={sendOutreach.bind(null, t.id)}
                        followUpAction={sendFollowUp.bind(null, t.id)}
                        updateStatusAction={updateStatus.bind(null, t.id)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
