// 파트너 채널의 전체 업로드 영상을 저비용으로 수집.
// api/search/route.ts의 ytChannelUploads(L436)와 동일 방식 — channels.list(part=contentDetails,
// 1유닛)로 업로드 재생목록 id를 얻고 playlistItems.list(part=snippet, 1유닛/50개)로 페이지네이션 —
// 을 재사용 가능한 형태로 추출하고 published_at을 추가한 것. route.ts는 무변경(자체 사본 유지).

// route.ts의 MAX_CHANNEL_VIDEOS와 동일값(파트너 전체수집 상한). import 대신 상수 복제(route 무변경).
const MAX_CHANNEL_VIDEOS = 200

export interface ChannelVideo {
  videoId: string
  title: string
  thumbnail: string
  publishedAt: string | null
}

interface PlaylistSnippet {
  title?: string
  publishedAt?: string
  resourceId?: { videoId?: string }
  thumbnails?: { medium?: { url?: string } }
}

// 업로드 재생목록은 최신순. opts.stopAt에 든 videoId(이미 동기화된 영상)를 만나면 즉시 종료해
// 증분 동기화의 quota를 아낀다(신규 영상만 몇 페이지 → ~2유닛). stopAt 없으면 cap까지 전체.
export async function fetchChannelUploads(
  channelId: string,
  opts: { cap?: number; stopAt?: Set<string> } = {},
): Promise<ChannelVideo[]> {
  const cap = opts.cap ?? MAX_CHANNEL_VIDEOS
  const key = process.env.YOUTUBE_API_KEY
  if (!key || !channelId) return []

  // 업로드 재생목록 id (channels.list contentDetails = 1유닛, 결정적)
  const chParams = new URLSearchParams({ part: 'contentDetails', id: channelId, key })
  const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?${chParams}`, { cache: 'no-store' })
  if (!chRes.ok) return []
  const chJson = (await chRes.json()) as {
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[]
  }
  const uploads = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []

  const out: ChannelVideo[] = []
  let pageToken: string | undefined
  // 페이지당 1유닛. cap 도달 / 다음 페이지 없음 / stopAt 도달 시 종료.
  while (out.length < cap) {
    const params = new URLSearchParams({
      part: 'snippet', playlistId: uploads, maxResults: '50', key,
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, { cache: 'no-store' })
    if (!res.ok) break
    const json = (await res.json()) as { items?: { snippet?: PlaylistSnippet }[]; nextPageToken?: string }
    for (const it of json.items ?? []) {
      const videoId = it.snippet?.resourceId?.videoId
      if (!videoId) continue
      // 최신순이라, 이미 동기화된 영상을 만나면 그 뒤는 전부 기존 → 즉시 반환(증분 절약).
      if (opts.stopAt?.has(videoId)) return out.slice(0, cap)
      out.push({
        videoId,
        title: it.snippet?.title ?? '',
        thumbnail: it.snippet?.thumbnails?.medium?.url ?? '',
        publishedAt: it.snippet?.publishedAt ?? null,
      })
      if (out.length >= cap) return out
    }
    if (!json.nextPageToken) break
    pageToken = json.nextPageToken
  }
  return out.slice(0, cap)
}
