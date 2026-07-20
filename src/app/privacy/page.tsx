import Link from 'next/link'

export const metadata = {
  title: '개인정보처리방침 | MAPTUBE',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 text-sm leading-relaxed text-gray-700">
      <Link href="/" className="text-blue-500 hover:underline">← 홈으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">개인정보 처리방침</h1>
      <p className="text-gray-400 mb-1">시행일: 2026년 7월 17일</p>
      <p className="text-gray-400 mb-8">운영자: INEWA Labs (운영자 이상규)</p>

      <p className="mb-8">
        INEWA Labs(이하 &apos;운영자&apos;)는 MAPTUBE 서비스(이하 &apos;서비스&apos;)를 운영하며,
        「개인정보 보호법」 등 관련 법령을 준수하고 이용자의 개인정보를 보호하기 위해 다음과 같이
        개인정보 처리방침을 수립·공개합니다.
      </p>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목 및 방법</h2>
        <p>운영자는 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-3 font-semibold">구분</th>
                <th className="py-2 pr-3 font-semibold">수집 항목</th>
                <th className="py-2 font-semibold">수집 방법</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">일반 이용자</td>
                <td className="py-2 pr-3">닉네임</td>
                <td className="py-2">카카오 계정 연동(OAuth) 시 수집</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">일반 이용자</td>
                <td className="py-2 pr-3">이메일 (선택)</td>
                <td className="py-2">카카오 계정 연동 시 이용자가 동의한 경우 수집</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">일반 이용자</td>
                <td className="py-2 pr-3">찜·가본 곳 기록 (장소·영상 식별값)</td>
                <td className="py-2">이용자가 서비스 내에서 직접 저장</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">파트너 (유튜버)</td>
                <td className="py-2 pr-3">채널명, 채널 식별값, 구독자 수</td>
                <td className="py-2">구글 계정 연동(OAuth, YouTube 읽기 권한) 시 수집</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">파트너 (유튜버)</td>
                <td className="py-2 pr-3">이메일</td>
                <td className="py-2">구글 계정 연동 시 수집</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">공통 (자동수집)</td>
                <td className="py-2 pr-3">접속 IP의 해시값 (원문 미저장)</td>
                <td className="py-2">서비스 이용 시 자동 생성(아래 5항 참조)</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">공통 (자동수집)</td>
                <td className="py-2 pr-3">장소·영상 유입 기록 (파트너 식별값 포함, 이용자 식별자 미포함)</td>
                <td className="py-2">서비스 이용 시 자동 생성(아래 6항 참조)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-500 mt-3">
          ※ 이메일은 카카오 로그인 과정에서 이용자가 동의한 경우에만 수집되며, 동의하지 않아도 서비스
          이용에 제한이 없습니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ 파트너의 이메일은 파트너 신청·승인 안내 및 약관 변경 고지를 위해 수집합니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ 파트너의 구글 계정 연동 시, 운영자는 채널 소유권 확인에 필요한 채널 정보만 확인하며 구글
          연동 인증 정보(액세스 토큰·리프레시 토큰)는 저장하지 않습니다. 자세한 내용은{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Google 개인정보처리방침
          </a>
          을 참고하십시오.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">2. 개인정보의 수집·이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 로그인, 계정 관리</li>
          <li>찜·가본 곳 등 개인화 기능 제공</li>
          <li>파트너 채널 소유권 확인 및 파트너 서비스 제공</li>
          <li>서비스 이용 통계 분석 및 부정 이용(과다 요청 등) 방지</li>
          <li>지도에서 영상으로의 유입 측정(향후 파트너 정산 근거 포함)</li>
        </ul>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">3. 개인정보의 보유·이용 기간 및 파기</h2>
        <p>
          운영자는 개인정보의 수집·이용 목적이 달성되면 해당 정보를 지체 없이 파기합니다. 항목별 보유
          기간은 다음과 같습니다.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-3 font-semibold">항목</th>
                <th className="py-2 font-semibold">보유 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">일반 이용자 계정 정보(닉네임·이메일)</td>
                <td className="py-2">회원 탈퇴 시까지</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">찜·가본 곳 기록</td>
                <td className="py-2">이용자가 해제하거나 탈퇴 시까지</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">
                  파트너 채널 정보 (채널명·프로필 이미지·구독자 수·활동 지역·콘텐츠 분류)
                </td>
                <td className="py-2">파트너 해지 시까지</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">파트너 채널 식별자 (수신 거부 등 의사 이행 목적)</td>
                <td className="py-2">파트너가 파기를 요청할 때까지</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">파트너 이메일</td>
                <td className="py-2">회원 탈퇴 시까지</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">접속 IP 해시값</td>
                <td className="py-2">수집 후 1일 이내 자동 삭제</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">장소·영상 유입 기록</td>
                <td className="py-2">서비스 운영 기간 동안 보관</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          파기 방법: 전자적 파일 형태의 정보는 복구·재생이 불가능한 방법으로 삭제합니다.
        </p>
        <p className="text-gray-500 mt-3">
          ※ 파트너 해지는 파트너 자격의 종료이며 회원 탈퇴와 다릅니다. 파트너 해지 시 채널 정보는
          파기되나, 계정 정보(이메일 등)는 회원 탈퇴 시까지 보관되며 이용자는 소비자로서 서비스를 계속
          이용할 수 있습니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ 운영자는 월간 리포트 수신 거부 등 파트너가 표시한 의사를 해지 이후에도 계속 존중하기
          위하여, 그 이행에 필요한 최소한의 채널 식별자를 다른 정보와 분리하여 보관합니다. 이 식별자는
          파트너의 의사를 확인·이행하는 목적 이외에 이용하지 않으며, 파트너가 파기를 요청하는 경우
          지체 없이 파기합니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ 회원 탈퇴는 아래 9항의 개인정보 보호책임자 이메일로 요청하실 수 있습니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ 구글 연동 인증 정보(액세스 토큰·리프레시 토큰)는 애초에 저장하지 않으므로 별도의 보유
          기간이 없습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">4. 개인정보 처리의 위탁</h2>
        <p>
          운영자는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 외부 전문 업체에
          위탁하고 있습니다. 위탁 업체가 관련 법령을 준수하도록 관리·감독합니다.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-3 font-semibold">수탁 업체</th>
                <th className="py-2 pr-3 font-semibold">위탁 업무</th>
                <th className="py-2 font-semibold">비고</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">Supabase</td>
                <td className="py-2 pr-3">데이터 저장 및 계정 인증</td>
                <td className="py-2">데이터센터: 국내(서울 리전)</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">Vercel</td>
                <td className="py-2 pr-3">서비스 호스팅(애플리케이션 실행)</td>
                <td className="py-2">국외 이전(아래 5항 참조)</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">Resend</td>
                <td className="py-2 pr-3">이메일 발송</td>
                <td className="py-2">국외 이전(아래 5항 참조)</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">Anthropic</td>
                <td className="py-2 pr-3">영상 공개 텍스트(제목·설명)의 AI 분석</td>
                <td className="py-2">개인정보 미전송</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">카카오</td>
                <td className="py-2 pr-3">지도 서비스 및 카카오 로그인</td>
                <td className="py-2">국내</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">구글(Google)</td>
                <td className="py-2 pr-3">파트너 채널 인증(YouTube 연동)</td>
                <td className="py-2">파트너 본인의 구글 로그인</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          운영자는 서비스의 데이터베이스를 국내(서울 리전)에 두고 있습니다. 다만 애플리케이션 실행·
          이메일 발송 과정에서 아래와 같이 개인정보가 국외로 이전됩니다.
        </p>
        <p className="text-gray-500 mt-3">
          ※ AI를 통한 장소 추출에는 영상의 공개 텍스트 정보(제목·설명)만 이용하며, 이용자의 개인정보는
          AI 처리에 제공되지 않습니다.
        </p>
        <p className="text-gray-500 mt-1">
          ※ YouTube API 서비스 이용에는{' '}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            YouTube 서비스 약관
          </a>
          이 함께 적용됩니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">5. 개인정보의 국외 이전</h2>
        <p>
          운영자는 「개인정보 보호법」 제28조의8에 따라 아래와 같이 개인정보가 국외로 이전되는 사실을
          알립니다.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-3 font-semibold">구분</th>
                <th className="py-2 font-semibold">내용</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">이전받는 자</td>
                <td className="py-2">
                  Vercel Inc. (서비스 호스팅) / Resend, Inc. (이메일 발송)
                </td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">이전되는 국가</td>
                <td className="py-2">미국</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">이전 항목</td>
                <td className="py-2">
                  Vercel: 접속 IP, 위치 정보, 로그인 세션 정보 / Resend: 이메일 주소, 문의 시 입력한
                  내용
                </td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">이전 일시 및 방법</td>
                <td className="py-2">서비스 이용·이메일 발송 시 정보통신망을 통해 전송</td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3">이전받는 자의 이용 목적</td>
                <td className="py-2">
                  Vercel: 애플리케이션 실행(서비스 제공) / Resend: 안내·알림 이메일 발송
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">이전받는 자의 보유 기간</td>
                <td className="py-2">각 사의 처리 목적 달성 시까지</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 다만 위 이전은 서비스 제공에 필수적이므로,
          거부하실 경우 서비스 이용이 제한됩니다. 거부를 원하시는 경우 아래 개인정보 보호책임자에게
          요청하시기 바랍니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">6. 개인정보 자동 수집 장치의 운영</h2>
        <p>운영자는 서비스 운영을 위해 아래와 같은 정보를 자동으로 생성·수집합니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            부정 이용 방지(요청 제한): 접속 IP를 복원 불가능한 형태로 암호화(해시)하여 처리하며, 원문
            IP는 저장하지 않고 1일 이내 자동 삭제합니다. 이는 과다 요청 등 부정 이용을 막기 위한
            것입니다.
          </li>
          <li>
            이용 측정: 지도에서 영상으로 이동한 기록을 수집합니다. 이 기록의 처리는 아래와 같이
            구분됩니다.
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>
                최종 이용자에 관하여: 누가 이동했는지를 알 수 있는 정보(회원 식별자·IP 등)를 저장하지
                않습니다.
              </li>
              <li>
                파트너에 관하여: 어느 파트너의 장소·영상인지를 구분하기 위한 파트너 식별값을 함께
                저장합니다. 이는 향후 파트너 정산의 근거가 되며, 그 자체로는 개인을 알아볼 수 없는
                가명처리된 형태로 보관됩니다.
              </li>
            </ul>
          </li>
        </ul>
        <p className="mt-2">
          이용자는 위 자동 수집을 원하지 않을 경우 서비스 이용을 중단할 수 있으나, 일부 기능 이용이
          제한될 수 있습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">7. 정보주체(이용자)의 권리와 행사 방법</h2>
        <p>이용자는 언제든지 자신의 개인정보에 대해 다음 권리를 행사할 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>개인정보 열람·정정·삭제 요구</li>
          <li>개인정보 처리 정지 요구</li>
          <li>동의 철회 및 회원 탈퇴</li>
        </ul>
        <p className="mt-2">
          권리 행사는 아래 개인정보 보호책임자에게 이메일로 요청하실 수 있으며, 운영자는 지체 없이
          조치합니다. 회원 탈퇴를 원하시는 경우에도 같은 방법으로 요청하시면 계정과 관련 정보를
          파기합니다.
        </p>
        <p className="mt-2">
          파트너가 구글 계정 연동으로 부여한 데이터 접근 권한은{' '}
          <a
            href="https://security.google.com/settings/security/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Google 보안 설정 페이지
          </a>
          에서 언제든지 직접 철회할 수 있습니다.
        </p>
        <p className="text-gray-500 mt-2">
          ※ 파트너는 파트너 대시보드에서 장소 정보를 직접 수정·비공개 처리할 수 있으며, 파트너 해지도
          직접 요청하실 수 있습니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">8. 연령에 관한 사항</h2>
        <p>
          파트너(유튜버) 신청은 만 19세 이상만 가능합니다. 운영자는 신청 화면에 이를 고지하며, 신청자는
          이를 확인하고 신청합니다.
        </p>
        <p className="mt-2">
          운영자는 만 14세 미만 아동의 개인정보를 수집하지 않으며, 만 14세 미만 아동의 개인정보가
          수집된 사실이 확인되는 경우 지체 없이 파기합니다.
        </p>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">9. 개인정보 보호책임자</h2>
        <p>
          이용자는 개인정보 관련 문의·불만·피해 구제를 아래 책임자에게 요청할 수 있으며, 운영자는 지체
          없이 답변·처리합니다.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3 font-semibold w-40">개인정보 보호책임자</td>
                <td className="py-2">이상규</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3 font-semibold">연락처(이메일)</td>
                <td className="py-2">inewalabs@gmail.com</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-7">
        <h2 className="font-bold text-base mb-2">10. 운영 주체의 변경 및 권리·의무의 승계</h2>
        <p>
          운영자는 현재 개인(INEWA Labs)으로서 서비스를 운영하고 있으며, 향후 사업자등록·법인 전환 또는
          사업 양도가 이루어질 수 있습니다. 이러한 사유로 이용자의 개인정보가 이전되는 경우, 운영자는
          「개인정보 보호법」 제27조에 따라 아래 사항을 사전에 알립니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>개인정보를 이전하려는 사실</li>
          <li>개인정보를 이전받는 자의 명칭·주소·연락처</li>
          <li>이용자가 이전을 원하지 않는 경우 조치할 수 있는 방법 및 절차</li>
        </ul>
        <p className="mt-2">
          이용자는 이전을 원하지 않을 경우 동의 철회 및 회원 탈퇴(개인정보 파기)를 요청할 수 있습니다.
          개인정보를 이전받은 자는 「개인정보 보호법」 제27조 제3항에 따라 개인정보처리자로서 이전
          당시의 본래 목적으로만 개인정보를 이용합니다.
        </p>
      </section>

      <section>
        <h2 className="font-bold text-base mb-2">11. 처리방침의 변경</h2>
        <p>
          이 개인정보 처리방침은 법령·서비스의 변경에 따라 개정될 수 있으며, 변경 시 서비스 내 공지를
          통해 안내합니다.
        </p>
      </section>
    </div>
  )
}
