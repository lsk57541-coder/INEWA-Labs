import Link from 'next/link'
import GooglePartnerLoginButton from '@/components/auth/GooglePartnerLoginButton'

const ERROR_MESSAGE: Record<string, React.ReactNode> = {
  youtube_denied: 'YouTube 채널 연동이 취소되었습니다.',
  no_channel: '연동한 Google 계정에 연결된 YouTube 채널을 찾을 수 없습니다.',
  youtube_failed: 'YouTube 채널 연동에 실패했습니다. 다시 시도해주세요.',
  already_applied: '이미 등록된 채널입니다.',
  consent_required: '가입을 완료하려면 필수 동의가 필요해요. 아래에서 다시 시도해 주세요.',
  consent_failed: (
    <>
      가입 처리 중 문제가 생겼어요. 아래에서 다시 시도하거나{' '}
      <a href="mailto:inewalabs@gmail.com" className="underline font-medium">문의</a>해 주세요.
    </>
  ),
}

function MapPinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}
function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9 12 2" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function ZapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

const BENEFITS: { icon: React.ReactNode; title: string; body: React.ReactNode; highlight?: boolean }[] = [
  {
    icon: <MapPinIcon />,
    title: '오래된 영상도 계속 발견돼요',
    body: '1년 전에 올린 영상도 누가 그 장소를 검색하면 지도에 떠요.',
  },
  {
    icon: <PencilIcon />,
    title: '내 채널 장소를 직접 관리해요',
    body: 'AI 추출이 100% 정확하진 않아요. 잘못된 장소는 직접 고치고, 빠진 장소는 직접 추가할 수 있어요.',
    highlight: true,
  },
  {
    icon: <StarIcon />,
    title: '눈에 띄게 노출돼요',
    body: (
      <>
        파트너 장소는 <span className="inline-block rounded bg-[#FFD700] px-1 py-px text-[10px] font-extrabold leading-none text-[#5c4600] align-[1px]">금색 마커</span>
        {' + '}<span className="inline-block rounded bg-[#FFD700] px-1 py-px text-[10px] font-extrabold leading-none text-[#5c4600] align-[1px]">PARTNER</span> 배지 + 검색 결과 상위에 노출돼요.
      </>
    ),
  },
  {
    icon: <UsersIcon />,
    title: '사용자와 윈윈이에요',
    body: '사용자가 늘수록 내 영상 유입도 늘어요. 지도에서 내 영상으로 들어온 클릭도 확인할 수 있어요.',
  },
  {
    icon: <ZapIcon />,
    title: '따로 할 일 없어요',
    body: '연동 한 번이면 새로 올리는 영상도 자동 반영돼요.',
  },
]

const STEPS: { t: string; d: string }[] = [
  { t: 'YouTube 채널 연동 (30초)', d: '구글 로그인 한 번이면 끝.' },
  { t: '장소 자동 추출', d: 'AI가 내 영상 속 장소를 찾아 지도에 올려요.' },
  { t: '지도 노출 시작', d: '승인 절차 없이, 연동하는 순간 파트너로 활성화돼요.' },
]

const QA: { q: string; a: string }[] = [
  { q: '비용이 드나요?', a: '무료예요. 사용자가 늘수록 같이 성장하는 윈윈 구조라 초기 파트너에게 비용을 받지 않아요.' },
  { q: '채널을 연동하면 어떻게 떠요?', a: '시청자가 내 채널이나 지역을 검색하면 내 영상 속 장소가 전국 지도에 표시돼요.' },
  { q: '장소가 잘못 표시되면요?', a: '대시보드에서 직접 고치거나 빠진 장소를 추가할 수 있어요. 추가·수정한 장소는 지도에 바로 반영돼요.' },
  { q: '제가 뭘 해야 하나요?', a: '채널 연동 한 번이면 끝이에요. 새 영상도 자동 반영돼요.' },
  { q: '심사가 있나요?', a: '가입 심사는 없어요. 채널을 연동하면 바로 파트너로 활성화됩니다.' },
]

function CtaButton() {
  // 파트너 진입점 = 구글 로그인 1회(A모델). 소비자 카카오 버튼과는 완전히 별개.
  // 구글 로그인 → /partner/apply/callback → 채널증명 → completePartnerSignup 로 이어진다.
  return <GooglePartnerLoginButton />
}

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  // 파트너 진입점이 구글 로그인 버튼(GooglePartnerLoginButton)으로 바뀌어, 로그인 게이트 없이
  // 페이지를 보여준다. 버튼을 누르면 구글 OAuth가 시작된다. 소비자 카카오 로그인/게이트는 무관하게 그대로.

  return (
    <div className="min-h-screen bg-warm">
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-10">
      <Link href="/" className="text-xs text-ink-muted hover:text-ink">← 메인으로</Link>

      {/* 1. 헤더 + MAPTUBE 소개 */}
      <div className="mt-5 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold leading-snug" style={{ color: '#2a2320' }}>
          내 영상 속 장소를 지도로
        </h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          채널 연동 한 번으로 시청자가 영상 속 장소를 바로 찾아갈 수 있어요.
        </p>
        <div className="mt-4 rounded-lg border-l-4 border-coral bg-white px-4 py-3">
          <p className="text-xs font-bold text-coral mb-0.5">MAPTUBE는?</p>
          <p className="text-sm text-ink-muted leading-relaxed">
            유튜브 영상 속 맛집·카페·여행지를 지도에서 바로 찾아주는 서비스예요.
          </p>
        </div>
      </div>

      {/* 에러 */}
      {error && ERROR_MESSAGE[error] && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {ERROR_MESSAGE[error]}
        </div>
      )}

      {/* 2. 상단 CTA */}
      <div className="mb-4">
        <CtaButton />
        <p className="text-[11px] text-gray-400 text-center mt-2">가입 심사 없음 · 연동하면 바로 활성화</p>
      </div>

      {/* 2-1. 활용 가이드 (보조 — 주 CTA보다 약한 아웃라인) */}
      <div className="mb-8 rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">📄 파트너 활용 가이드 (PDF)</p>
        <p className="text-xs text-ink-muted mt-0.5">연동 전에 먼저 살펴보세요.</p>
        <div className="flex gap-2 mt-3">
          <a
            href="/partner-guide.pdf"
            target="_blank"
            rel="noopener"
            className="flex-1 text-center text-xs border border-line text-ink-muted bg-white rounded-lg py-2 hover:bg-surface transition"
          >
            바로 보기
          </a>
          <a
            href="/partner-guide.pdf"
            download
            className="flex-1 text-center text-xs border border-line text-ink-muted bg-white rounded-lg py-2 hover:bg-surface transition"
          >
            다운로드
          </a>
        </div>
      </div>

      {/* 3. 혜택 5개 */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3 pl-3 border-l-4 border-coral">파트너 혜택</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className={`flex items-start gap-3 rounded-lg p-4 ${
                b.highlight ? 'border border-coral bg-coral-soft' : 'bg-white border border-line'
              }`}
            >
              <span className={`shrink-0 mt-0.5 ${b.highlight ? 'text-coral' : 'text-ink-muted'}`}>{b.icon}</span>
              <div>
                <p className="text-sm font-semibold leading-snug">{b.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{b.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 연동 방법 3단계 */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3 pl-3 border-l-4 border-coral">연동 방법</h2>
        <div className="space-y-3">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-coral text-white text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-snug">{s.t}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Q&A */}
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3 pl-3 border-l-4 border-coral">자주 묻는 질문</h2>
        <div className="space-y-2">
          {QA.map((item) => (
            <details key={item.q} className="group rounded-lg border border-line bg-white overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-800">
                <span>Q. {item.q}</span>
                <span className="text-gray-400 transition-transform group-open:rotate-180 shrink-0 ml-2">▾</span>
              </summary>
              <p className="px-4 pb-3 text-xs text-gray-500 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 6. 하단 CTA + 동의 안내 */}
      <CtaButton />
      <p className="text-xs text-gray-400 leading-relaxed text-center mt-4">
        채널 연동 시 영상 자막 데이터를 장소 추출 목적으로만 활용하며,<br className="hidden sm:block" />
        언제든 설정에서 해제할 수 있습니다.
      </p>
    </div>
    </div>
  )
}
