import GooglePartnerLoginButton from '@/components/auth/GooglePartnerLoginButton'

// ── 임시 격리 검증용 harness (2단계 라이브 진입점 교체 시 제거 예정) ──
// 라이브 /partner/apply 의 CTA를 아직 건드리지 않고, 신규 구글 파트너 인증
// 흐름(버튼 → 전용 콜백 → 채널증명 → completePartnerSignup → 대시보드)을
// 끝까지 돌려보기 위한 격리 진입점. 여기서 검증 통과 후에야 2단계에서
// 실제 /partner/apply 진입점을 교체한다.
export default function PocPartnerGooglePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Isolated verify · 라이브 진입점 미접촉
        </p>
        <h1 className="mt-2 text-xl font-bold text-neutral-900">
          구글 파트너 인증 흐름 검증
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          이 버튼은 실제 <code>/partner/apply/callback</code> 전용 콜백을 태워
          구글 로그인 1회로 세션·채널증명·파트너 가입까지 끝까지 돌립니다.
          라이브 <code>/partner/apply</code> 의 CTA는 아직 그대로입니다.
        </p>
        <div className="mt-6">
          <GooglePartnerLoginButton />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          테스트용 구글 계정(유튜브 채널 보유)으로 진행하세요. 검증 후 생성된
          파트너 행과 테스트 유저는 정리 SQL로 원복합니다.
        </p>
      </div>
    </main>
  )
}
