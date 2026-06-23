import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const ERROR_MESSAGE: Record<string, string> = {
  youtube_denied: 'YouTube 채널 연동이 취소되었습니다.',
  no_channel: '연동한 Google 계정에 연결된 YouTube 채널을 찾을 수 없습니다.',
  youtube_failed: 'YouTube 채널 연동에 실패했습니다. 다시 시도해주세요.',
  already_applied: '이미 등록된 채널입니다.',
}

function MapPinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function TrendingUpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function ZapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

const BENEFITS = [
  {
    icon: <MapPinIcon />,
    title: '오래된 영상도 계속 발견됩니다',
    body: '1년 전에 올린 영상도 사용자가 그 장소를 검색하면 지도에 표시됩니다. 영상 수명이 자연스럽게 늘어납니다.',
  },
  {
    icon: <TrendingUpIcon />,
    title: '사용자가 늘수록 트래픽도 늘어납니다',
    body: 'MAPTUBE 사용자가 증가할수록 내 장소를 발견하는 사람도 늘어납니다. 별도 홍보 없이 자동으로 노출됩니다.',
  },
  {
    icon: <ZapIcon />,
    title: '별도 작업이 없습니다',
    body: '채널 연동 한 번으로 끝납니다. 새 영상을 올리면 자동으로 반영됩니다.',
  },
]

const STEPS = [
  'YouTube 채널 연동 (30초)',
  '영상 속 장소 자동 추출',
  '지도에 내 채널 노출 시작',
]

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 메인으로</Link>

      {/* 헤더 */}
      <div className="mt-6 mb-8">
        <h1 className="text-2xl font-bold leading-snug" style={{ color: '#0F1C2E' }}>
          내 영상 속 장소를 지도로
        </h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          채널 연동 한 번으로<br />
          시청자가 바로 찾아갈 수 있어요
        </p>
      </div>

      {/* 에러 */}
      {error && ERROR_MESSAGE[error] && (
        <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {ERROR_MESSAGE[error]}
        </div>
      )}

      {/* 장점 3개 */}
      <div className="space-y-3 mb-8">
        {BENEFITS.map((b) => (
          <div key={b.title} className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
            <span className="text-gray-700 shrink-0 mt-0.5">{b.icon}</span>
            <div>
              <p className="text-sm font-semibold leading-snug">{b.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{b.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 연동 방법 3단계 */}
      <div className="mb-8">
        <p className="text-sm font-semibold mb-3">연동 방법</p>
        <div className="space-y-3">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <a
        href="/api/auth/youtube/start"
        className="block text-center bg-red-600 text-white rounded-lg py-3.5 text-base font-medium hover:bg-red-700 transition mb-4"
      >
        ▶ YouTube 채널 연동하기
      </a>

      {/* 동의 안내 */}
      <p className="text-xs text-gray-400 leading-relaxed text-center">
        채널 연동 시 영상 자막 데이터를 장소 추출 목적으로만 활용하며,<br />
        언제든 설정에서 해제할 수 있습니다.
      </p>
    </div>
  )
}
