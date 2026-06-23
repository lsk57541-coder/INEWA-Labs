import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

interface ExtractedPlace {
  name: string
  timestamp_seconds: number | null
}

interface YouTubeSnippet {
  title: string
  description: string
}

function mmssToSeconds(mmss: string): number | null {
  const m = mmss.match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// Clean trailing parenthetical notes like "(수영장 - 바베큐 풀빌라)" from place names
function cleanName(raw: string): string {
  return raw.replace(/\s*[\(\（].*?[\)\）]$/, '').replace(/\s+/g, ' ').trim()
}

// Non-place keywords to skip from timestamp lines
const SKIP_KEYWORDS = ['인트로', '아침', '점심', '저녁', '출발', '이동', '도착', '일기', 'outro', 'intro', 'ending']

// Primary extraction: parse "mm:ss 장소명" lines directly from description.
// Works without Claude and handles the most common Korean travel vlog format.
function extractFromTimestamps(description: string): ExtractedPlace[] {
  const results: ExtractedPlace[] = []
  const lines = description.split('\n')

  for (const line of lines) {
    const match = line.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/)
    if (!match) continue

    const [, ts, rawName] = match
    const name = cleanName(rawName)
    if (!name || name.length < 2) continue

    // Skip lines that are clearly not businesses
    const lower = name.toLowerCase()
    if (SKIP_KEYWORDS.some(kw => lower.includes(kw))) continue

    // Skip lines that look like pure Korean geography (도/시/군 etc.) with no brand feel
    if (/^[가-힣]{2,4}(시|군|구|동|읍|면)$/.test(name)) continue

    results.push({ name, timestamp_seconds: mmssToSeconds(ts) })
  }

  return results.slice(0, 15)
}

async function getVideoSnippet(videoId: string): Promise<YouTubeSnippet | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = await res.json() as { items?: { snippet: YouTubeSnippet }[] }
  const item = json.items?.[0]
  if (!item) return null
  return item.snippet
}

// Fallback: use Claude when no timestamp-format entries found
async function extractWithClaude(title: string, description: string): Promise<ExtractedPlace[]> {
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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId param' }, { status: 400 })

  const snippet = await getVideoSnippet(videoId)
  if (!snippet) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  // Try timestamp regex first (fast, no API call needed)
  let places = extractFromTimestamps(snippet.description)

  // Fall back to Claude if nothing found via regex
  if (places.length === 0) {
    places = await extractWithClaude(snippet.title, snippet.description)
  }

  return NextResponse.json({ places })
}
