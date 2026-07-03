import Link from 'next/link'

export const metadata = {
  title: '개인정보처리방침 | MAPTUBE',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <Link href="/" className="text-blue-500 hover:underline">← 홈으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">개인정보처리방침</h1>
      <p className="text-gray-400 mb-8">시행일: 2026년 7월 3일</p>

      <p className="mb-8">
        INEWA Labs(이하 &apos;회사&apos;)는 MAPTUBE 서비스(이하 &apos;서비스&apos;)를 운영하며,
        이용자의 개인정보를 중요하게 생각하고 「개인정보보호법」 등 관련 법령을 준수합니다.
        회사는 본 방침을 통해 이용자가 제공하는 개인정보가 어떠한 목적과 방식으로 이용되고 있으며,
        개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
      </p>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목</h2>

        <p className="font-semibold mt-2 mb-1">가. 카카오 소셜 로그인 시 (일반 회원)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>닉네임, 프로필 사진, 카카오 계정 식별값(고유 ID)</li>
        </ul>

        <p className="font-semibold mt-3 mb-1">나. YouTube 채널 연동 시 (파트너 회원)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>YouTube 채널 ID·채널명, 구독자 수, 채널 프로필 이미지</li>
          <li>Google OAuth 인증 토큰(access token / refresh token) — 채널 소유 확인 및 채널 정보 조회 목적</li>
        </ul>

        <p className="font-semibold mt-3 mb-1">다. 서비스 이용 과정에서 자동 생성·수집되는 정보</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>찜(관심목록) 내역, 위치 오류 신고 내역, 문의 내역</li>
          <li>서비스 이용 기록, 쿠키</li>
        </ul>

        <p className="text-gray-500 mt-3">※ 회사는 카카오 로그인 시 이메일 주소를 수집하지 않습니다.</p>
        <p className="text-gray-500 mt-1">※ 회사는 부정 이용 방지를 위한 최소한의 접근 빈도 관리 외에 이용자의 IP 주소를 저장하지 않습니다.</p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">2. 개인정보의 수집·이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 카카오 로그인 기반 서비스 제공</li>
          <li>파트너 회원의 YouTube 채널 소유권 확인 및 채널 정보 표시</li>
          <li>찜(관심목록), 위치 오류 신고, 문의 응대 등 회원 맞춤 기능 제공</li>
          <li>부정 이용 방지 및 서비스 안정성 확보</li>
          <li>서비스 개선을 위한 통계 분석</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">3. YouTube API Services 사용 고지</h2>
        <p>
          본 서비스는 <strong>YouTube API Services</strong>를 사용하여 공개된 YouTube 영상의 제목·설명·
          썸네일·통계 정보(조회수·구독자 수 등) 및 채널 정보를 가져와 지도 위에 표시합니다. 회사는 영상
          콘텐츠(영상 파일·음성·자막)를 다운로드하거나 저장하지 않으며, 공개된 텍스트 메타데이터
          (제목·설명 등)만을 분석하여 장소(POI) 정보를 추출합니다.
        </p>
        <p className="mt-2">
          영상 콘텐츠 분석 과정에서 영상 속 인물 등 제3자의 정보가 부수적으로 포함될 수 있으나, 회사는
          이를 별도로 수집·저장하지 않으며 장소(POI) 정보 추출 목적으로만 일시적으로 처리합니다.
        </p>
        <p className="mt-2">
          YouTube API Services 이용과 관련하여 Google의 개인정보처리방침이 함께 적용됩니다. 자세한
          내용은{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Google 개인정보처리방침
          </a>
          {' '}및{' '}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            YouTube 서비스 약관
          </a>
          을 참고해 주세요.
        </p>
        <p className="mt-2">
          이용자는{' '}
          <a
            href="https://security.google.com/settings/security/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Google 보안 설정 페이지
          </a>
          에서 언제든지 본 서비스의 데이터 접근 권한을 철회할 수 있습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">4. 개인정보 및 API 데이터의 보유·이용 기간</h2>
        <p>
          회원 탈퇴 시 또는 수집·이용 목적이 달성된 경우 해당 개인정보를 지체 없이 파기합니다.
          다만 관계 법령에 의해 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다.
        </p>
        <p className="mt-3 font-semibold">YouTube API 데이터 보관 정책:</p>
        <p className="mt-1">
          YouTube에서 가져온 통계 정보(조회수·구독자 수 등)는 다음과 같이 처리하여, 어떠한 통계
          데이터도 30일을 초과하여 보관하지 않습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>검색 결과로 표시되는 통계: 실시간으로 조회하며, 최대 20분간만 임시 캐시합니다.</li>
          <li>등록된 영상의 저장된 통계: 최소 7일마다 주기적으로 갱신하여 최신 상태로 유지합니다.</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">5. 개인정보의 제3자 제공</h2>
        <p>
          회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나
          이용자의 별도 동의가 있는 경우에는 예외로 합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">6. 개인정보 처리의 위탁</h2>
        <p>회사는 안정적인 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Supabase, Inc. — 회원 인증 및 데이터베이스 보관</li>
          <li>Vercel Inc. — 서비스 호스팅 및 배포</li>
          <li>Anthropic, PBC — AI를 이용한 영상 메타데이터 분석 및 장소 정보 추출</li>
          <li>Resend (Plus Five Five, Inc.) — 서비스 관련 이메일 발송</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">7. 제3자 서비스 연동</h2>
        <p>
          본 서비스는 아래 제3자 서비스와 연동되며, 해당 서비스 이용 시 각 사의 약관 및
          개인정보처리방침이 함께 적용됩니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            카카오 — 소셜 로그인 인증, 지도 표시, 카카오톡 공유 (
            <a
              href="https://policy.kakao.com/kr/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              카카오 개인정보처리방침
            </a>
            )
          </li>
          <li>
            Google / YouTube — YouTube Data API를 통한 영상 정보 조회, Google OAuth 채널 인증 (
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Google 개인정보처리방침
            </a>
            )
          </li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">8. 이용자의 권리 및 삭제 정책</h2>
        <p>
          이용자는 언제든지 본인의 개인정보(찜·관심목록·위치 오류 신고 내역 등 YouTube API Services를
          통해 처리된 데이터 포함)를 조회, 정정, 삭제, 처리정지를 요청할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>일반 회원 탈퇴</strong>: 햄버거 메뉴 → 로그인 정보에서 탈퇴를 요청하면, 카카오 계정
            연동 정보 및 찜·관심목록 등 보유 중인 개인정보가 지체 없이 파기됩니다. (위치 오류 신고·문의
            내역은 서비스 품질 관리를 위해 개인 식별 정보를 제거한 상태로 보관될 수 있습니다.)
          </li>
          <li>
            <strong>파트너 회원 탈퇴</strong>: 설정 → 파트너 탈퇴를 요청하면, 등록한 장소가 비공개
            처리되며 YouTube 채널 연동 정보 및 인증 토큰(access token / refresh token)이 즉시
            삭제됩니다.
          </li>
          <li>
            <strong>개별 삭제 요청</strong>: 탈퇴 없이 특정 데이터만 삭제를 원하시면 아래 문의처로
            이메일을 보내주세요. 본인 확인 후 7일 이내 처리합니다.
          </li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">9. 개인정보 보호책임자 및 문의처</h2>
        <p>이메일: inewalabs@gmail.com</p>
      </section>

      <section>
        <h2 className="font-bold text-base mb-2">10. 방침의 변경</h2>
        <p>
          본 방침은 법령, 정책 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지를
          통해 안내합니다.
        </p>
      </section>
    </div>
  )
}
