import Link from 'next/link'

export const metadata = {
  title: '파트너십 이용약관 | MAPTUBE',
}

export default function PartnerTermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <Link href="/" className="text-blue-500 hover:underline">← 홈으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">파트너십 이용약관</h1>
      <p className="text-gray-400 mb-1">시행일: 2026년 7월 17일</p>
      <p className="text-gray-400 mb-8">운영자: INEWA Labs (운영자 이상규)</p>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제1조 (목적)</h2>
        <p>
          본 약관은 INEWA Labs(이하 &apos;운영자&apos;)가 제공하는 MAPTUBE 서비스(이하 &apos;서비스&apos;)의
          파트너십 프로그램에 참여하는 YouTube 채널 운영자(이하 &apos;파트너&apos;)와 운영자 간의
          권리·의무 및 책임사항을 정하는 것을 목적으로 합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제2조 (운영 주체)</h2>
        <p>
          &apos;운영자&apos;는 MAPTUBE를 운영하는 개인(브랜드명 &apos;INEWA Labs&apos;)을 말합니다. 향후
          사업자등록·법인 설립이 이루어지는 경우 본 약관에 따른 권리·의무는 해당 사업체에 승계되며, 그
          절차는 제9조에 따릅니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제3조 (파트너 자격)</h2>
        <p>① 파트너십은 만 19세 이상의 YouTube 채널 운영자를 대상으로 합니다.</p>
        <p className="mt-2">② 파트너는 연동하는 채널에 대한 정당한 운영 권한을 보유함을 보증합니다.</p>
        <p className="mt-2">
          ③ 운영자는 신청 화면에 만 19세 이상 대상임을 고지하며, 신청자는 이를 확인하고 신청합니다.
          자격을 충족하지 않음이 확인된 경우 운영자는 파트너십을 해지하고 관련 정보를 파기합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제4조 (파트너십의 성립)</h2>
        <p>
          ① 파트너십은 신청자가 본 약관 및 데이터 활용에 동의하고, Google 계정 연동을 통해 채널
          소유권 확인이 완료된 때 성립합니다. 별도의 심사 절차는 없습니다.
        </p>
        <p className="mt-2">
          ② 운영자는 다음의 경우 파트너십을 해지할 수 있습니다. 이 경우 제10조 제1항 및 제5항을
          준용합니다.
        </p>
        <ol className="list-decimal pl-8 space-y-1 mt-1">
          <li>제3조의 자격을 충족하지 않는 경우</li>
          <li>채널 운영 권한이 확인되지 않는 경우</li>
          <li>서비스의 취지에 반하는 콘텐츠를 주로 게시하는 경우</li>
          <li>기타 관계 법령 또는 본 약관을 위반한 경우</li>
        </ol>
        <p className="mt-2">③ 파트너십은 현재 무상으로 운영되며, 파트너에게 비용이 청구되지 않습니다.</p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제5조 (데이터 활용 범위)</h2>
        <p>
          ① 운영자는 공식 YouTube Data API를 통해 파트너 채널의 공개 정보를 조회하며, 그 범위는 다음과
          같습니다.
        </p>
        <ol className="list-decimal pl-8 space-y-1 mt-1">
          <li>영상 제목·설명란 텍스트 — AI 장소 인식·추출의 입력으로 사용</li>
          <li>조회수·구독자수·업로드일·채널명 — 표시·정렬·필터 목적</li>
          <li>채널 식별값 — 채널 소유권 확인 목적</li>
        </ol>
        <p className="mt-2">
          ② 운영자는 제1항의 정보에서 장소의 명칭·주소·위치좌표 등 사실 정보(이하 &apos;POI 정보&apos;)를
          추출하며, 추출된 POI 정보는 지도 표시·검색 기능 제공을 위해 데이터베이스에 저장·관리됩니다.
        </p>
        <p className="mt-2">③ 운영자는 다음을 수행하지 않습니다.</p>
        <ol className="list-decimal pl-8 space-y-1 mt-1">
          <li>영상 파일·자막 원문의 다운로드·저장·처리 (자막·댓글은 API를 호출하지 않습니다)</li>
          <li>영상 설명란 원문의 영속 저장 (AI 추출 입력에만 사용 후 폐기)</li>
          <li>썸네일 이미지의 분석·저장 (YouTube가 제공하는 링크로 화면에 표시만 합니다)</li>
          <li>Google 계정 연동 인증 정보(액세스 토큰·리프레시 토큰)의 저장</li>
        </ol>
        <p className="mt-2">
          ④ 운영자는 채널 소유권 확인을 위해 읽기 전용 권한(youtube.readonly)만 요청하며, 파트너의
          영상을 게시·수정·삭제하지 않습니다.
        </p>
        <p className="mt-2">
          ⑤ 운영자는{' '}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            YouTube API 서비스 약관
          </a>{' '}
          및 Google 정책을 준수하며, 저작물 자체의 무단 복제·재배포를 하지 않습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제6조 (파트너 혜택)</h2>
        <p>① 운영자는 파트너에게 다음을 제공합니다.</p>
        <ol className="list-decimal pl-8 space-y-1 mt-1">
          <li>파트너 채널 영상 속 장소의 지도 노출</li>
          <li>파트너 배지 및 검색 결과 우선 노출</li>
          <li>파트너 대시보드를 통한 장소 관리 기능</li>
          <li>지도에서 영상으로의 유입 통계 제공</li>
        </ol>
        <p className="mt-2">
          ② 제1항의 혜택은 현재 무상으로 제공되며, 서비스 운영 상황에 따라 변경될 수 있습니다. 변경 시
          제13조에 따라 사전에 고지합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제7조 (파트너의 권리)</h2>
        <p>① 파트너는 본인 채널에서 추출된 POI 정보에 대하여 다음 권리를 가집니다.</p>
        <ol className="list-decimal pl-8 space-y-1 mt-1">
          <li>정확 여부의 확인 및 정정</li>
          <li>장소 정보의 수정</li>
          <li>특정 장소의 비공개 처리</li>
        </ol>
        <p className="mt-2">
          ② 파트너는 언제든지 파트너십을 해지하거나 동의를 철회할 수 있으며, 그 절차와 효과는 제10조에
          따릅니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제8조 (파트너의 의무)</h2>
        <p>
          ① 파트너는 채널에 대한 정당한 운영 권한을 보유하여야 하며, 타인의 채널을 연동해서는 안
          됩니다.
        </p>
        <p className="mt-2">
          ② 파트너는 장소 정보를 확인·수정할 때 사실과 다른 정보를 고의로 입력해서는 안 됩니다.
        </p>
        <p className="mt-2">③ 파트너는 서비스의 정상적인 운영을 방해하는 행위를 해서는 안 됩니다.</p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제9조 (운영 주체 변경·승계)</h2>
        <p>
          ① 사업자등록, 법인 전환, 합병·분할, 영업양도 등으로 운영 주체가 변경되는 경우, 본 약관에
          따른 권리·의무 및 파트너와의 관계는 새로운 운영 주체에게 승계됩니다.
        </p>
        <p className="mt-2">
          ② 운영자는 운영 주체 변경으로 파트너의 개인정보가 이전되는 경우, 「개인정보 보호법」 제27조에
          따라 이전 사실·시점, 이전받는 자의 명칭·연락처, 이전을 원하지 않는 경우의 조치 방법 및 절차를
          사전에 알립니다.
        </p>
        <p className="mt-2">
          ③ 파트너는 이전을 원하지 않을 경우 동의 철회 및 파트너십 해지(개인정보 파기)를 요청할 수
          있습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제10조 (해지·철회 및 데이터 처리)</h2>
        <p>
          ① 파트너가 파트너십을 해지하는 경우, 운영자는 채널명·프로필 이미지·구독자 수·활동 지역·콘텐츠
          분류 및 계정 연결 정보를 지체 없이 파기합니다. 다만 제4항 및 제5항의 경우는 예외로 합니다.
        </p>
        <p className="mt-2">
          ② 파트너십 해지는 파트너 자격의 종료이며 회원 탈퇴와 다릅니다. 해지 후에도 파트너는 일반
          이용자로서 서비스를 계속 이용할 수 있으며, 계정 정보의 파기를 원하는 경우 개인정보 처리방침이
          정한 방법으로 회원 탈퇴를 요청할 수 있습니다.
        </p>
        <p className="mt-2">
          ③ 파트너가 데이터 활용 동의를 철회하는 경우, 운영자는 해당 채널에 대한 신규 POI 추출 및
          활용을 중단하고 기존에 노출 중이던 POI 정보를 비공개 처리합니다.
        </p>
        <p className="mt-2">
          ④ 동의 사실의 증명을 위하여 동의 이력(동의 시점·동의 범위·약관 버전·채널 식별값)은 해지
          이후에도 보존됩니다. 이 기록은 수정·삭제가 불가능한 형태로 관리되며, 동의 여부에 관한 분쟁이
          발생할 경우의 증명 이외의 목적으로 이용하지 않습니다.
        </p>
        <p className="mt-2">
          ⑤ 운영자는 월간 리포트 수신 거부 등 파트너가 표시한 의사를 해지 이후에도 계속 존중하기
          위하여, 그 이행에 필요한 최소한의 채널 식별자를 다른 정보와 분리하여 보관합니다. 이 식별자는
          파트너의 의사를 확인·이행하는 목적 이외에 이용하지 않으며, 파트너가 파기를 요청하는 경우 지체
          없이 파기합니다.
        </p>
        <p className="mt-2">
          ⑥ 장소 검증 이력 및 지도에서 영상으로의 유입 통계는 서비스 운영·정산 목적으로 보존됩니다.
          이 기록은 파트너 정산을 위해 파트너 식별값을 포함하여 보관되며, 정산 및 서비스 운영 이외의
          목적으로 이용하지 않습니다.
        </p>
        <p className="mt-2">
          ⑦ 운영 주체 변경으로 개인정보가 이전된 후 파트너가 철회를 요청하는 경우, 승계인은 「개인정보
          보호법」 제27조 제3항에 따라 개인정보처리자로서 관계 법령(제37조 등)에 따라 철회·파기 의무를
          이행합니다. 본 약관은 파트너의 법정 권리를 제한하지 않습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제11조 (향후 수익 모델)</h2>
        <p>① 파트너십은 현재 무상으로 운영됩니다.</p>
        <p className="mt-2">
          ② 운영자가 향후 수익 모델을 도입하는 경우, 초기 파트너에게 우대 조건을 제공할 수 있습니다.
          구체적인 내용은 도입 시 별도로 정하여 고지합니다.
        </p>
        <p className="mt-2">③ 본 조는 운영자에게 수익 배분 의무를 발생시키지 않습니다.</p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제12조 (면책)</h2>
        <p>
          ① 운영자는 AI 자동 추출의 특성상 장소 정보가 부정확할 수 있음을 고지하며, 파트너의 확인·정정
          기능을 통해 이를 보완합니다.
        </p>
        <p className="mt-2">
          ② 운영자는 천재지변, YouTube 등 외부 서비스의 정책 변경·중단 등 운영자의 통제를 벗어난
          사유로 인한 서비스 중단에 대하여 책임을 지지 않습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제13조 (약관의 변경)</h2>
        <p>① 운영자는 관계 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있습니다.</p>
        <p className="mt-2">
          ② 약관을 변경하는 경우 시행일 및 변경 사유를 명시하여 시행일로부터 7일 전에 서비스 내에
          게시하거나 파트너의 이메일로 통지합니다. 다만 파트너에게 불리한 변경의 경우 30일 전에 게시
          또는 통지합니다.
        </p>
        <p className="mt-2">③ 파트너가 변경된 약관에 동의하지 않는 경우 파트너십을 해지할 수 있습니다.</p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">제14조 (준거법 및 관할)</h2>
        <p>
          본 약관은 대한민국 법령에 따라 해석되며, 운영자와 파트너 간에 발생한 분쟁에 관하여는
          민사소송법상의 관할법원에 제소합니다.
        </p>
      </section>

      <section>
        <h2 className="font-bold text-base mb-2">부칙</h2>
        <p>본 약관은 2026년 7월 17일부터 시행합니다.</p>
      </section>
    </div>
  )
}
