import Anthropic from '@anthropic-ai/sdk'
import { BUSINESS_NAME_RE, KOREAN_PLACE_RE } from './extractLocation'

interface YTCommentSnippet {
  textDisplay: string
  authorChannelId?: { value: string }
}

interface YTCommentThreadItem {
  snippet: {
    topLevelComment: { snippet: YTCommentSnippet }
  }
  replies?: { comments: { snippet: YTCommentSnippet }[] }
}

interface CommentNode {
  text: string
  isChannelOwner: boolean
}

// commentThreads.list costs 1 quota unit (vs. search.list's 100), and this
// is only ever called once title/address matching has already failed, so
// the extra calls stay small relative to the existing quota budget.
async function fetchTopComments(videoId: string, channelId: string): Promise<CommentNode[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []

  const params = new URLSearchParams({
    part: 'snippet,replies',
    videoId,
    order: 'relevance',
    maxResults: '20',
    textFormat: 'plainText',
    key,
  })

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`)
    if (!res.ok) return []
    const json = await res.json() as { items?: YTCommentThreadItem[] }

    const nodes: CommentNode[] = []
    for (const item of json.items ?? []) {
      const top = item.snippet.topLevelComment.snippet
      nodes.push({ text: top.textDisplay, isChannelOwner: top.authorChannelId?.value === channelId })
      for (const reply of item.replies?.comments ?? []) {
        nodes.push({
          text: reply.snippet.textDisplay,
          isChannelOwner: reply.snippet.authorChannelId?.value === channelId,
        })
      }
    }
    return nodes
  } catch {
    return []
  }
}

const LOCATION_QUESTION_RE = /(위치|어디|상호명?|가게|매장)/

function regexCandidate(nodes: CommentNode[]): string | null {
  // Channel-owner replies are the most trustworthy (the creator confirming
  // their own filming location), so check those first.
  const ordered = [...nodes].sort((a, b) => Number(b.isChannelOwner) - Number(a.isChannelOwner))
  for (const node of ordered) {
    const explicit = node.text.match(BUSINESS_NAME_RE)
    if (explicit) return explicit[1].trim().split(/\s{2,}|[|/]/)[0].trim()
  }
  for (const node of ordered) {
    const place = node.text.match(KOREAN_PLACE_RE)
    if (place) return place[0]
  }
  return null
}

// Builds the "어디예요?" question + the reply that answers it, since neither
// alone reliably contains a place name but the pair usually does.
function questionAnswerText(nodes: CommentNode[]): string {
  const relevant = nodes.filter((n) => LOCATION_QUESTION_RE.test(n.text) || n.isChannelOwner)
  return relevant.map((n) => n.text).join('\n').slice(0, 800)
}

export async function extractPlaceFromComments(videoId: string, channelId: string): Promise<string | null> {
  const nodes = await fetchTopComments(videoId, channelId)
  if (nodes.length === 0) return null

  const regexMatch = regexCandidate(nodes)
  if (regexMatch) return regexMatch

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const text = questionAnswerText(nodes)
  if (!text) return null

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: `다음은 유튜브 영상 댓글과 답글이야. 영상에 나온 장소/가게의 이름이 언급되어 있으면 그 이름만 출력해. 없으면 "없음"이라고만 답해.\n\n"${text}"`,
        },
      ],
    })
    const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (answer === '없음' || !answer) return null
    return answer
  } catch {
    return null
  }
}
