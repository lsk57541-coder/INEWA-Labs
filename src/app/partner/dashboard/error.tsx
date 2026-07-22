'use client'

// 파트너 대시보드(설정/장소) 에러 바운더리. withdrawPartner·addPlace 등 이 세그먼트
// 하위에서 uncaught throw가 나면(SettingsControls·PlacesList가 try/catch 없이 호출)
// 여기서 잡힌다. 없으면 프로덕션에서 generic "Application error..." 백지 화면이 뜬다.
// error.message는 각 액션이 던지는 한글 메시지 문자열과 정확히 일치시켜 매칭한다 —
// 문자열이 바뀌면 이 매칭도 같이 갱신해야 한다(actions.ts 쪽은 이번에 무수정).
import Link from 'next/link'

const CONTACT_HREF = 'mailto:inewalabs@gmail.com'

export default function PartnerDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const msg = error.message ?? ''

  let text = '문제가 발생했어요. 다시 시도해 주세요.'
  let actions: React.ReactNode = (
    <>
      <button onClick={reset} className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
        다시 시도
      </button>
      <a href={CONTACT_HREF} className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-gray-50">
        문의하기
      </a>
    </>
  )

  if (msg.includes('데모 계정은 탈퇴할 수 없습니다')) {
    text = '이 계정은 데모용이라 탈퇴할 수 없어요.'
    actions = (
      <Link href="/partner/dashboard" className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
        대시보드로
      </Link>
    )
  } else if (msg.includes('로그인이 필요합니다')) {
    text = '로그인이 만료됐어요. 다시 로그인해 주세요.'
    actions = (
      <Link href="/login" className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
        로그인하기
      </Link>
    )
  } else if (msg.includes('파트너 정보를 찾을 수 없습니다')) {
    text = '파트너 정보를 확인할 수 없어요. 문제가 계속되면 문의해 주세요.'
    actions = (
      <>
        <button onClick={reset} className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
          새로고침
        </button>
        <a href={CONTACT_HREF} className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-gray-50">
          문의하기
        </a>
      </>
    )
  } else if (msg.includes('탈퇴 처리에 실패했습니다')) {
    text = '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.'
    actions = (
      <>
        <button onClick={reset} className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
          다시 시도
        </button>
        <a href={CONTACT_HREF} className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-gray-50">
          문의하기
        </a>
      </>
    )
  } else if (msg.includes('상호명을 입력해주세요')) {
    text = '상호명을 입력해 주세요.'
    actions = (
      <button onClick={reset} className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
        다시 시도
      </button>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <p className="text-sm text-gray-700 mb-5">{text}</p>
      <div className="flex items-center justify-center gap-2">{actions}</div>
    </div>
  )
}
