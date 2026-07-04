// 이름 정규화 — 문자/숫자만 남기고(공백·기호 제거) 소문자화. 상호명 매칭·dedup 키 공통 유틸.
// (ExtractPlacesForm.tsx, BulkLocationForm.tsx에도 동일 로직 사본이 남아 있음 — 통합은 백로그.)
export function normName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
}
