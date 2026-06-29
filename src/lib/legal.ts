// 약관/개인정보 버전의 단일 출처. 약관 페이지 표시 + (예정) consent_logs.terms_version 기록이
// 같은 값을 참조하게 한다. 개정 시 이 값만 바꾸면 화면·동의기록이 함께 갱신된다.
export const TERMS_VERSION = '2026-06-18' // 약관 시행일 = 버전

// 'YYYY-MM-DD' → 'YYYY년 M월 D일' (시행일 한국어 표기 공용)
export function formatEffectiveDate(version: string = TERMS_VERSION): string {
  const [y, m, d] = version.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}
