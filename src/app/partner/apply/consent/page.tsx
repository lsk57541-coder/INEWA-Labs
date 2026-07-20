import { cookies } from 'next/headers'
import { PENDING_CHANNEL_COOKIE, type PendingChannel } from '@/lib/partnerPendingChannel'
import { submitPartnerConsent } from '@/app/partner/apply/actions'

export const metadata = {
  title: '파트너십 동의 | MAPTUBE',
}

// C-2 C단계 α — 동의 인터스티셜(뼈대만). 문구·약관링크·만19세·승계고지·레이아웃은 β에서.
// 로그인 게이트 없음(미들웨어가 /partner/dashboard·/admin만 게이트 → 자동 공개).
export default async function PartnerConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  // 콜백이 심어둔 핸드오프 쿠키에서 채널명만 읽어 표시(있으면). 실제 게이트는 서버액션에 있다.
  const cookieStore = await cookies()
  const raw = cookieStore.get(PENDING_CHANNEL_COOKIE)?.value
  let channelName: string | null = null
  if (raw) {
    try {
      channelName = (JSON.parse(raw) as PendingChannel).channelName
    } catch {
      channelName = null
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-xl font-bold mb-2">파트너십 동의</h1>
      {channelName && (
        <p className="text-gray-500 mb-6">{channelName} 채널로 파트너십을 시작합니다.</p>
      )}

      {error === 'consent_incomplete' && (
        <p className="text-red-500 mb-4">필수 항목에 모두 동의해야 진행할 수 있습니다.</p>
      )}

      <form action={submitPartnerConsent} className="space-y-4">
        {/* β에서 문구·약관 전문 링크로 교체 예정 */}
        <label className="flex items-start gap-2">
          <input type="checkbox" name="agree_terms" className="mt-0.5" />
          <span>파트너십 약관 동의 (필수)</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="agree_data" className="mt-0.5" />
          <span>데이터 활용 동의 (필수)</span>
        </label>
        <button
          type="submit"
          className="w-full bg-coral text-white rounded-lg py-3 text-sm font-semibold hover:bg-coral-ink transition"
        >
          동의하고 시작하기
        </button>
      </form>
    </div>
  )
}
