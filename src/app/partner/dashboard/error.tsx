'use client'

// 파트너 대시보드 에러 바운더리 — 진짜 예상 못한 예외(DB 오류 등)만 담당한다.
// expected error(로그인만료·데모가드·파트너없음·상호명미입력·탈퇴실패)는 각 Server Action이
// throw 대신 {error:'키'}를 반환하고 호출부(SettingsControls·PlacesList)가 인라인 배너로 안내한다
// (Next 프로덕션은 Server Action throw의 message를 generic으로 가려 여기서 message 분기가 무력이므로).
// 따라서 이 파일은 케이스 분기 없이 generic 안내 + 복구(reset)만 제공해 백지 화면만 막는다.

const CONTACT_HREF = 'mailto:inewalabs@gmail.com'

export default function PartnerDashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <p className="text-sm text-gray-700 mb-5">문제가 발생했어요. 다시 시도해 주세요.</p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={reset} className="text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700">
          다시 시도
        </button>
        <a href={CONTACT_HREF} className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-gray-50">
          문의하기
        </a>
      </div>
    </div>
  )
}
