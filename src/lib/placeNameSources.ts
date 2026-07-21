// placeName 출처의 단일 출처(single source of truth) — most to least reliable.
// 배열 순서가 곧 서열이며, route.ts의 PlaceNameSource 타입과 meetsConfidence의
// indexOf 서열비교가 모두 이 배열에서 파생된다. Kept in its own module (not a
// "use server" file, which can only export async functions) so it can be shared
// by actions.ts, route.ts, and admin/page.tsx without a circular import.
//
// ★ 'comment_match'는 더 이상 새로 생성되지 않는다(댓글 추출 제거 — 문서가 "댓글 API를
// 호출하지 않음"을 선언). 목록에서 빼지 말 것:
//   1) placename_resolutions에 과거 12건이 남아 있어 admin 통계·라벨이 이 값을 렌더한다.
//   2) 이 목록에서 빠지면 indexOf가 -1이 되어, 관리자가 이 값을 임계치로 고르면
//      meetsConfidence가 전부 false → 검색 결과 전멸.
export const PLACENAME_SOURCES = [
  'correction',
  'explicit_description',
  'title_match',
  'address_match',
  'comment_match',
  'address_fallback',
] as const

export type MinConfidenceSource = (typeof PLACENAME_SOURCES)[number]
