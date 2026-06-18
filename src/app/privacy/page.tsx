import Link from 'next/link'

export const metadata = {
  title: '개인정보처리방침 | AI맵튜브',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <Link href="/" className="text-blue-500 hover:underline">← 홈으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">개인정보처리방침</h1>
      <p className="text-gray-400 mb-8">시행일: 2026년 6월 18일</p>

      <p className="mb-8">
        INEWA Labs(이하 &apos;회사&apos;)는 AI맵튜브 서비스(이하 &apos;서비스&apos;)를 운영하며,
        이용자의 개인정보를 중요하게 생각하고 「개인정보보호법」 등 관련 법령을 준수합니다.
        회사는 본 방침을 통해 이용자가 제공하는 개인정보가 어떠한 목적과 방식으로 이용되고 있으며,
        개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
      </p>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>카카오 소셜 로그인 시: 닉네임, 프로필 사진, 카카오 계정 식별값(고유 ID), 이메일(이용자가 제공에 동의한 경우)</li>
          <li>서비스 이용 과정에서 자동 생성: 찜(관심목록) 내역, 위치 오류 신고 내역, 접속 로그, 접속 IP, 쿠키</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">2. 개인정보의 수집·이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 카카오 로그인 기반 서비스 제공</li>
          <li>찜(관심목록), 위치 오류 신고 등 회원 맞춤 기능 제공</li>
          <li>부정 이용 방지 및 서비스 안정성 확보</li>
          <li>서비스 개선을 위한 통계 분석</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">3. YouTube API Services 사용 고지</h2>
        <p>
          본 서비스는 <strong>YouTube API Services</strong>를 사용하여 공개된 YouTube 영상의 제목·설명·
          자막·썸네일·통계 정보를 가져와 지도 위에 표시합니다. 영상 콘텐츠 분석 과정에서 영상 속
          인물 등 제3자의 정보가 부수적으로 포함될 수 있으나, 회사는 이를 별도로 수집·저장하지 않으며
          장소(POI) 정보 추출 목적으로만 일시적으로 처리합니다.
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
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">4. 개인정보의 보유 및 이용 기간</h2>
        <p>
          회원 탈퇴 시 또는 수집·이용 목적이 달성된 경우 해당 개인정보를 지체 없이 파기합니다.
          다만 관계 법령에 의해 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다.
        </p>
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
          <li>카카오 — 소셜 로그인 인증, 지도 표시, 카카오톡 공유</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">7. 이용자의 권리 및 삭제 정책</h2>
        <p>
          이용자는 언제든지 본인의 개인정보(찜·관심목록·위치 오류 신고 내역 등 YouTube API Services를
          통해 처리된 데이터 포함)를 조회, 정정, 삭제, 처리정지를 요청할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>회원 탈퇴</strong>: 햄버거 메뉴 → 로그인 정보에서 탈퇴를 요청하면 카카오 계정 연동
            정보, 찜·관심목록·신고 내역 등 보유 중인 모든 개인정보가 지체 없이 파기됩니다.
          </li>
          <li>
            <strong>개별 삭제 요청</strong>: 탈퇴 없이 특정 데이터만 삭제를 원하시면 아래 문의처로
            이메일을 보내주세요. 본인 확인 후 7일 이내 처리합니다.
          </li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">8. 개인정보 보호책임자 및 문의처</h2>
        <p>이메일: inewalabs@gmail.com</p>
      </section>

      <section>
        <h2 className="font-bold text-base mb-2">9. 방침의 변경</h2>
        <p>
          본 방침은 법령, 정책 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지를
          통해 안내합니다.
        </p>
      </section>
    </div>
  )
}
