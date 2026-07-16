// Custom Google OAuth2 flow for verifying a partner applicant's YouTube
// channel — kept separate from Supabase Auth (which only handles the
// platform's own Kakao login) since we need a raw access token to read the
// applicant's own channel via the YouTube Data API.
//
// ★ 토큰은 이 요청 안에서만 산다. 채널 소유권 증명(fetchOwnChannel)이 끝나면
// 그걸로 용도가 완결되므로 DB에 저장하지 않는다. refresh token은 요청하지도
// (access_type: 'offline' 없음) 받지도 않는다 — 개인정보보호법 제3조① 최소수집.

export const YOUTUBE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
export const OAUTH_STATE_COOKIE = 'yt_oauth_state'
export const OAUTH_REDIRECT_PATH = '/api/auth/youtube'

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_OAUTH_SCOPE,
    // ★ access_type: 'offline' 없음 = 구글이 refresh token을 애초에 발급하지 않는다.
    // 채널 소유권 증명(fetchOwnChannel)은 access token 하나로 끝나므로 offline 접근을
    // 요청할 근거가 없다(최소수집). prompt: 'consent'는 동의 로그(logConsent)가
    // 실제 동의 시점과 일치하도록 매번 동의창을 띄우기 위해 유지한다.
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// refresh_token은 필드 자체를 두지 않는다 — offline 접근을 요청하지 않으므로
// 구글이 발급하지 않고, 받더라도 쓸 곳이 없다.
interface GoogleTokens {
  access_token: string
  expires_in: number
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens | null> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) return null
  return res.json() as Promise<GoogleTokens>
}

export interface OwnChannel {
  channelId: string
  channelName: string
  subscriberCount: number
  thumbnail: string | null
}

export async function fetchOwnChannel(accessToken: string): Promise<OwnChannel | null> {
  const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null

  const json = await res.json() as {
    items?: {
      id: string
      snippet: { title: string; thumbnails?: { default?: { url: string }; medium?: { url: string } } }
      statistics: { subscriberCount?: string }
    }[]
  }
  const channel = json.items?.[0]
  if (!channel) return null

  return {
    channelId: channel.id,
    channelName: channel.snippet.title,
    subscriberCount: parseInt(channel.statistics.subscriberCount ?? '0', 10),
    // 마커용 채널 아바타(추가 quota 0 — snippet에 이미 포함). 없으면 null → 코드에서 fallback.
    thumbnail: channel.snippet.thumbnails?.medium?.url ?? channel.snippet.thumbnails?.default?.url ?? null,
  }
}
