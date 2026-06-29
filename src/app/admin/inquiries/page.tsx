import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminTabNav from '@/components/admin/AdminTabNav'
import { getInquiries } from '@/app/actions'
import InquiryStatusToggle from './InquiryStatusToggle'
import InquiryReplyForm from './InquiryReplyForm'

export default async function AdminInquiriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const inquiries = await getInquiries()
  const unreadCount = inquiries.filter((i) => i.status === 'unread').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-3">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>
      </div>
      <AdminTabNav active="문의" />

      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-bold">문의</h1>
        {unreadCount > 0 && (
          <span className="text-xs font-bold text-white bg-blue-600 rounded-full px-2 py-0.5">
            안읽음 {unreadCount}
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto">총 {inquiries.length}건</span>
      </div>

      {inquiries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>접수된 문의가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((q) => (
            <div
              key={q.id}
              className={`border rounded-lg p-4 ${q.status === 'unread' ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-gray-900">{q.nickname ?? '(알 수 없음)'}</span>
                <span className="text-xs text-gray-400">{new Date(q.created_at).toLocaleString('ko-KR')}</span>
                {q.reply && (
                  <span className="text-[10px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5">답변완료</span>
                )}
                <span className="ml-auto">
                  <InquiryStatusToggle id={q.id} status={q.status} />
                </span>
              </div>
              <p className="text-sm font-bold mb-1">{q.title}</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{q.content}</p>

              <InquiryReplyForm id={q.id} reply={q.reply} repliedAt={q.replied_at} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
