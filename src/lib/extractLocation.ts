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
