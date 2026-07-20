import Link from 'next/link'
import { cookies } from 'next/headers'
import { PENDING_CHANNEL_COOKIE, type PendingChannel } from '@/lib/partnerPendingChannel'
import { submitPartnerConsent } from '@/app/partner/apply/actions'

export const metadata = {
  title: '파트너십 동의 | MAPTUBE',
}

// C-2 C단계 β — 동의 인터스티셜 화면 콘텐츠. 서버 게이트·로그 로직은 submitPartnerConsent /
// completePartnerSignup 에 있고(무수정), 이 화면은 필수동의 2 + 승계'고지' + 만19세 자기신고.
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
      {/* 1. 상단 안내 */}
      <h1 className="text-xl font-bold mb-2 text-gray-900">MAPTUBE 파트너 신청</h1>
      <p className="text-gray-600 mb-1">
        유튜브 채널을 연동하면, 영상 속 장소가 지도에 표시되고 직접 확인·수정하실 수 있습니다.
      </p>
      {channelName && (
        <p className="text-coral font-semibold mb-6">{channelName} 채널로 파트너십을 시작합니다.</p>
      )}
      {!channelName && <div className="mb-6" />}

      {error === 'consent_incomplete' && (
        <p className="text-red-500 mb-4">필수 항목에 모두 동의해야 진행할 수 있습니다.</p>
      )}

      <form action={submitPartnerConsent} className="space-y-5">
        {/* 2. 필수 동의 1 — 파트너십 이용약관 */}
        <div className="border border-line rounded-lg p-4">
          <label className="flex items-start gap-2 font-medium text-gray-900">
            <input type="checkbox" name="agree_terms" className="mt-0.5 shrink-0" />
            <span>[필수] MAPTUBE 파트너십 이용약관에 동의합니다.</span>
          </label>
          <p className="mt-2 pl-6">
            <Link
              href="/partner/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-coral underline"
            >
              약관 전문 보기
            </Link>
          </p>
        </div>

        {/* 3. 필수 동의 2 — 데이터 활용 (상세 기본 펼침) */}
        <div className="border border-line rounded-lg p-4">
          <label className="flex items-start gap-2 font-medium text-gray-900">
            <input type="checkbox" name="agree_data" className="mt-0.5 shrink-0" />
            <span>[필수] 내 YouTube 채널의 공개 정보를 아래와 같이 활용하는 데 동의합니다.</span>
          </label>

          <div className="mt-3 pl-6 space-y-3 text-xs text-gray-600">
            <div>
              <p className="font-semibold text-gray-700">수집 항목</p>
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                <li>영상 제목·설명란 텍스트 (AI 장소 추출용)</li>
                <li>조회수·구독자수·업로드일·채널명 (표시·정렬·필터용)</li>
                <li>채널 식별값 (소유권 확인용)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700">이용 목적</p>
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                <li>영상 속 장소를 추출해 지도 표시</li>
                <li>대시보드에서 확인·수정·비공개</li>
                <li>지도→영상 유입 통계 제공</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700">보유 기간</p>
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                <li>채널 정보: 파트너 해지 시까지</li>
                <li>이메일: 회원 탈퇴 시까지 (파트너 해지는 회원 탈퇴와 다릅니다)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700">하지 않는 것</p>
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                <li>구글 인증 토큰 저장 안 함 (소유권 확인에만 사용, 미저장)</li>
                <li>자막·댓글 안 가져옴</li>
                <li>썸네일 분석·저장 안 함</li>
                <li>영상 파일·설명 원문 저장 안 함</li>
              </ul>
            </div>
            <p className="text-gray-500">
              동의를 거부하실 수 있으나, 이 항목은 파트너십에 반드시 필요하여 거부 시 신청이 제한됩니다.
            </p>
            <p>
              <Link
                href="/partner/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-coral underline"
              >
                데이터 활용 상세는 파트너십 약관 제5조
              </Link>
            </p>
          </div>
        </div>

        {/* 4. 고지(동의 아님) — 운영 주체 변경. 시각적으로 확실히 분리(연한 배경 + '안내' 라벨) */}
        <div className="rounded-lg bg-surface border border-line p-4 text-xs text-gray-600">
          <p className="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 mb-2">
            안내
          </p>
          <p className="font-semibold text-gray-700">운영 주체가 변경되는 경우</p>
          <p className="mt-1 leading-relaxed">
            MAPTUBE는 현재 개인(INEWA Labs)이 운영하며, 향후 사업자등록·법인 전환 또는 사업 양도가
            있을 수 있습니다. 이 경우 「개인정보 보호법」 제27조에 따라 그 사실·시점·이전받는 자
            정보·반대 방법을 사전에 알려드립니다. 원하지 않으시면 그때 철회 및 파트너 해지를 요청하실
            수 있습니다.
          </p>
          <p className="mt-2">
            자세한 내용은{' '}
            <Link
              href="/partner/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-coral underline"
            >
              파트너십 약관 제9조
            </Link>{' '}
            및{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-coral underline"
            >
              개인정보 처리방침
            </Link>
            .
          </p>
        </div>

        {/* 5. 만 19세 자기신고 — 화면 게이팅만(consent_logs 미기록) */}
        <div className="border border-line rounded-lg p-4">
          <label className="flex items-start gap-2 font-medium text-gray-900">
            <input type="checkbox" name="agree_age" className="mt-0.5 shrink-0" />
            <span>[필수] 만 19세 이상입니다.</span>
          </label>
        </div>

        {/* 6. 하단 안내 + 제출 */}
        <p className="text-xs text-gray-500">
          연동 시 읽기 전용 권한(youtube.readonly)만 요청하며, 영상을 임의로 게시·수정·삭제하지
          않습니다.
        </p>
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
