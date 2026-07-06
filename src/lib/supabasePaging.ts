// Supabase(PostgREST) 전체조회 select은 명시적 .range()가 없으면 기본 페이지 한도(1000행)로
// 초과분이 에러·로그 없이 조용히 잘린다(예: locations 1223행 → 223행 상시 유실). 모든 페이지를
// .range()로 순회해 전부 모은다.
// ★makeQuery에 결정적 order가 반드시 포함돼야 페이지 경계에서 행이 누락/중복되지 않는다
//   (id 단독, 또는 화면 표시순서 유지가 필요하면 "표시컬럼 desc + id" 복합 order).
// ★페이지 실패는 console.error로 남기고(silent failure 금지) 그때까지 모은 것을 반환한다
//   (throw 없음: 부분 성공 > 전체 유실, 호출 흐름은 절대 안 막음 — 등록장소/신고 등 핵심 데이터라
//   fire-and-forget 계측과 달리 로그로 알 수 있어야 하되, 실패 시에도 서비스는 안 멈춰야 하기 때문).
export async function selectAllPaged<Row>(
  label: string,
  makeQuery: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
): Promise<Row[]> {
  const PAGE = 1000
  const all: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1)
    if (error) {
      console.error(`[${label}] 페이지 실패(from=${from}):`, error.message)
      break
    }
    const page = data ?? []
    all.push(...page)
    if (page.length < PAGE) break // 마지막 페이지(한 페이지가 PAGE 미만이면 끝)
  }
  return all
}
