import Anthropic from '@anthropic-ai/sdk'

export interface ExtractedPlace {
  name: string
  timestamp_seconds: number | null
}

export interface YouTubeSnippet {
  title: string
  description: string
  channelId: string
}

export function mmssToSeconds(mmss: string): number | null {
  const m = mmss.match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function cleanName(raw: string): string {
  return raw.replace(/\s*[\(\（].*?[\)\）]$/, '').replace(/\s+/g, ' ').trim()
}

const SKIP_KEYWORDS = ['인트로', '아침', '점심', '저녁', '출발', '이동', '도착', '일기', 'outro', 'intro', 'ending']

export function extractFromTimestamps(description: string): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  const lines = description.split('\n')

  for (const line of lines) {
    const match = line.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/)
    if (!match) continue

    const [, ts, rawName] = match
    const name = cleanName(rawName)
    if (!name || name.length < 2) continue

    const lower = name.toLowerCase()
    if (SKIP_KEYWORDS.some(kw => lower.includes(kw))) continue
    if (/^[가-힣]{2,4}(시|군|구|동|읍|면)$/.test(name)) continue

    results.push({ name, timestamp_seconds: mmssToSeconds(ts) })
  }

  return results.slice(0, 15)
}

export async function extractWithClaude(title: string, description: string): Promise<ExtractedPlace[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const text = `제목: ${title}\n\n설명:\n${description}`.slice(0, 4000)

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `다음 유튜브 영상 제목과 설명에서 방문한 식당, 카페, 숙소 등의 상호명(가게 이름)만 추출해줘.
타임스탬프(00:00 형식)가 있으면 함께 추출해줘.
JSON 배열로만 반환해. 다른 텍스트 없이 JSON만:
[{"name": "상호명", "timestamp": "mm:ss 또는 null"}]

없으면 빈 배열 [] 반환.

영상 정보:
${text}`,
        },
      ],
    })

    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = answer.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as { name: string; timestamp: string | null }[]
    return parsed
      .filter(p => p.name && typeof p.name === 'string')
      .map(p => ({
        name: cleanName(p.name),
        timestamp_seconds: p.timestamp ? mmssToSeconds(p.timestamp) : null,
      }))
      .filter(p => p.name.length >= 2)
      .slice(0, 15)
  } catch {
    return []
  }
}

export async function getVideoSnippet(videoId: string): Promise<YouTubeSnippet | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = await res.json() as { items?: { snippet: { title: string; description: string; channelId: string } }[] }
  const item = json.items?.[0]
  if (!item) return null
  return {
    title: item.snippet.title,
    description: item.snippet.description,
    channelId: item.snippet.channelId,
  }
}
