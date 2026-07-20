import Link from 'next/link'
import { formatEffectiveDate } from '@/lib/legal'

export const metadata = {
  title: '이용약관 | MAPTUBE',
}

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <Link href="/" className="text-blue-500 hover:underline">← 홈으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">이용약관</h1>
      <p className="text-gray-400 mb-8">시행일: {formatEffectiveDate()}</p>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제1조 (목적)</h2>
        <p>
          본 약관은 INEWA Labs(이하 &apos;회사&apos;)가 제공하는 MAPTUBE 서비스(이하 &apos;서비스&apos;)의
          이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제2조 (서비스의 내용)</h2>
        <p>서비스는 YouTube Data API를 통해 공개된 영상 정보를 AI로 분석하여 장소를 추출하고, 이를 지도 위에 표시하는 기능을 제공합니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>키워드·위치 기반 영상 검색 및 지도 표시</li>
          <li>회원 대상 찜(관심목록) 기능</li>
          <li>위치 정보 오류 신고 기능</li>
          <li>카카오톡 공유 기능</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제3조 (회원가입 및 로그인)</h2>
        <p>
          서비스의 일부 기능(찜 등)은 카카오 계정을 통한 로그인 후 이용할 수 있습니다. 회원은 가입
          시 제공한 정보가 사실에 부합함을 보증하며, 정보 변경 시 즉시 갱신해야 합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제4조 (콘텐츠 저작권 및 데이터 처리)</h2>
        <p>
          ① 서비스에 노출되는 영상은 YouTube에 게시된 콘텐츠이며, 저작권은 각 영상의 원저작자(채널
          운영자)에게 있습니다.
        </p>
        <p className="mt-2">
          ② 회사는 영상 파일 및 자막 원문 등 저작물 자체를 복제·저장하지 않으며, 영상 표시는 YouTube
          링크 연결 및 YouTube Data API를 통한 공식적 방식으로만 수행합니다.
        </p>
        <p className="mt-2">
          ③ 회사는 YouTube Data API로 가져온 공개 정보를 AI로 분석하여 장소의 명칭·주소·위치좌표 등
          사실 정보(이하 &apos;POI 정보&apos;)를 추출하며, 추출된 POI 정보는 지도 표시·검색 기능 제공을
          위해 데이터베이스에 저장·관리됩니다.
        </p>
        <p className="mt-2">
          ④ 회사는 YouTube API 서비스 약관 및 Google 정책을 준수하며, 저작물 자체의 무단 복제·재배포를
          하지 않습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제5조 (정보의 정확성 및 면책)</h2>
        <p>
          서비스에서 제공하는 장소 정보는 AI가 영상 콘텐츠를 분석하여 추출한 결과로, 실제 위치와
          다를 수 있습니다. 회사는 정확도 향상을 위해 노력하나 정보의 완전성·정확성을 보증하지
          않으며, 이용자는 이를 참고용으로만 활용해야 합니다. 영업시간, 폐업 여부 등 현장 정보는
          반드시 별도로 확인하시기 바랍니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제6조 (이용자의 의무)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>허위 정보 신고, 비정상적 방법으로의 서비스 접근(크롤링, 자동화 수집 등) 금지</li>
          <li>타인의 계정을 도용하거나 서비스를 영리 목적으로 무단 재배포하는 행위 금지</li>
          <li>관계 법령 및 본 약관을 준수할 의무</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제7조 (서비스의 변경 및 중단)</h2>
        <p>
          회사는 운영상, 기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며,
          이 경우 사전에 서비스 내 공지를 통해 안내합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제8조 (권리·의무의 승계)</h2>
        <p>
          ① 사업자등록, 법인 전환, 합병·분할, 영업양도 등으로 운영 주체가 변경되는 경우, 본 약관에
          따른 권리·의무 및 이용자와의 관계는 새로운 운영 주체에게 승계됩니다.
        </p>
        <p className="mt-2">
          ② 회사는 운영 주체 변경으로 이용자의 개인정보가 이전되는 경우, 「개인정보 보호법」 제27조에
          따라 이전 사실·시점, 이전받는 자의 명칭·연락처, 이전을 원하지 않는 경우의 조치 방법 및 절차를
          사전에 알립니다.
        </p>
        <p className="mt-2">
          ③ 이용자는 승계를 원하지 않을 경우 동의 철회 및 회원 탈퇴(개인정보 파기)를 요청할 수
          있습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제9조 (약관의 변경)</h2>
        <p>① 회사는 관계 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있습니다.</p>
        <p className="mt-2">
          ② 회사가 약관을 변경하는 경우 시행일 및 변경 사유를 명시하여 시행일로부터 7일 전에 서비스
          내에 게시합니다. 다만 이용자에게 불리한 변경의 경우 30일 전에 게시합니다.
        </p>
        <p className="mt-2">③ 이용자가 변경된 약관에 동의하지 않는 경우 회원 탈퇴를 할 수 있습니다.</p>
      </section>

      <section>
        <h2 className="font-bold text-base mb-2">제10조 (문의처)</h2>
        <p>서비스 이용 관련 문의: inewalabs@gmail.com</p>
      </section>
    </div>
  )
}
