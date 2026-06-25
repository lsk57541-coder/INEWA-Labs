import Anthropic from '@anthropic-ai/sdk'

export const KOREAN_PLACE_RE =
  /([가-힣]+(?:시|군|구|동|읍|면|리|로|길|대로|가|역|공원|산|강|호수|바다|해변|항|포구|섬|도|반도|해|만|평야|분지|계곡|폭포|사찰|절|궁|궁궐|탑|성|고궁|박물관|미술관|시장|마을|마을|타운|센터|광장|플라자|몰|백화점|역사|유적|유원지|관광지|명소|스팟))/g

// Creators often label the business name explicitly in the description
// (e.g. "상호명 : 벅벅"). When present, this is far more reliable than
// guessing from the title or matching against Kakao, so check for it first.
export const BUSINESS_NAME_RE = /(?:상호명?|가게명|매장명|업체명|상점명)\s*[:：]\s*([^\n#]+)/

export function extractExplicitBusinessName(description: string): string | null {
  const match = description.match(BUSINESS_NAME_RE)
  if (!match) return null
  const name = match[1].trim().split(/\s{2,}|[|/]/)[0].trim()
  return name || null
}

// 제목/설명에 흔한 비-지명 수식어 — 업체명 추출 시 제거 대상.
const NOISE_WORDS = [
  '숨은맛집', '숨은', '맛집추천', '추천맛집', '맛집', '추천', '리뷰', '솔직후기', '후기',
  '먹방', '브이로그', 'vlog', 'Vlog', 'VLOG', '존맛탱', '존맛', '내돈내산', '핫플레이스',
  '핫플', '인생맛집', '찐맛집', '가성비', '대박', '미친', '베스트', 'best', 'BEST', 'top', 'TOP',
  '정리', '모음', '총정리', '근처', '여기', '여행', '코스',
]

function stripNoise(tokens: string[], region: string): string[] {
  return tokens.filter((t) => {
    if (!t) return false
    if (t === region) return false
    return !NOISE_WORDS.some((n) => t.includes(n))
  })
}

// 휴리스틱 우선: 검색 지역명(getRegionName 결과)을 앵커로 "지역 + 업체명" 후보 쿼리들을
// 우선순위 순으로 생성. API 호출 없음(순수 문자열 처리). 정규식 오탐(번역→역 등)을
// 피하기 위해 KOREAN_PLACE_RE 대신 지역 앵커 + 명시 업체명 방식을 사용.
export function buildHeuristicPlaceQueries(title: string, description: string, region: string | null): string[] {
  const out: string[] = []
  const push = (s: string | null | undefined) => {
    const v = (s ?? '').trim()
    if (v && !out.includes(v)) out.push(v)
  }

  // ① 설명란 명시 업체명 (상호명: ○○) — 가장 신뢰도 높음
  const explicit = extractExplicitBusinessName(description)
  if (explicit) {
    if (region) push(`${region} ${explicit}`)
    push(explicit)
  }

  // ② 지역 앵커: 제목에서 region 단어 이후 토큰을 업체명 후보로
  if (region && title.includes(region)) {
    const after = title.slice(title.lastIndexOf(region) + region.length)
    const tokens = stripNoise(after.split(/\s+/).filter(Boolean), region)
    if (tokens.length > 0) {
      push(`${region} ${tokens.join(' ')}`)
      push(`${region} ${tokens[tokens.length - 1]}`)
    }
  }

  return out
}

// AI 폴백: 휴리스틱이 반경 내 좌표를 못 찾았을 때만 호출. videoId로 캐시해 같은
// 영상에 대한 반복 호출을 막는다. 키가 없거나 실패하면 null(휴리스틱만으로 동작).
const aiQueryCache = new Map<string, string | null>()

export async function extractPlaceByAI(videoId: string, title: string, description: string): Promise<string | null> {
  if (aiQueryCache.has(videoId)) return aiQueryCache.get(videoId) ?? null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { aiQueryCache.set(videoId, null); return null }

  try {
    const client = new Anthropic({ apiKey })
    const text = `${title}\n${(description ?? '').slice(0, 300)}`
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: `다음 YouTube 영상 제목/설명에서 영상에서 실제 방문한 '국내(한국)' 장소의 '업체명'과 '지역명'을 추출해.\n주의:\n- 도시명/음식종류와 실제 방문 가게를 구분할 것. 예) '이스탄불'은 도시명이지만 '이스탄불그릴'은 가게명일 수 있음.\n- 영상에서 실제 방문한 국내(한국) 장소만 추출.\n- 해외 지명이거나 위치가 불명확하면 반드시 둘 다 null.\n반드시 JSON만 출력하고 다른 말은 하지 마: {"business": string|null, "region": string|null}\n\n${text}`,
        },
      ],
    })
    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const m = answer.match(/\{[\s\S]*\}/)
    if (!m) { aiQueryCache.set(videoId, null); return null }
    const parsed = JSON.parse(m[0]) as { business?: string | null; region?: string | null }
    const business = parsed.business?.trim() || null
    const aiRegion = parsed.region?.trim() || null
    // 지역명만 있으면(업체명 null) 정확한 위치 불가 → null. region+business일 때만 쿼리.
    const query = business ? (aiRegion ? `${aiRegion} ${business}` : business) : null
    aiQueryCache.set(videoId, query)
    return query
  } catch {
    aiQueryCache.set(videoId, null)
    return null
  }
}

export async function extractLocations(title: string, description: string): Promise<string[]> {
  const text = `${title} ${description}`.slice(0, 800)

  // Fast regex pass first
  const regexMatches = [...text.matchAll(KOREAN_PLACE_RE)].map((m) => m[1])
  if (regexMatches.length > 0) return [...new Set(regexMatches)].slice(0, 5)

  // AI fallback
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: `다음 YouTube 영상 텍스트에서 한국 지명(장소명)만 추출해서 쉼표로 구분해 출력해. 없으면 "없음"이라고만 답해.\n\n"${text}"`,
        },
      ],
    })

    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (answer === '없음' || !answer) return []
    return answer.split(/[,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
  } catch {
    return []
  }
}
