// Custom Google OAuth2 flow for verifying a partner applicant's YouTube
// channel — kept separate from Supabase Auth (which only handles the
// platform's own Kakao login) since we need the raw access/refresh tokens
// to read the applicant's own channel via the YouTube Data API.

export const YOUTUBE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
export const OAUTH_STATE_COOKIE = 'yt_oauth_state'
export const OAUTH_REDIRECT_PATH = '/api/auth/youtube'

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

interface GoogleTokens {
  access_token: string
  refresh_token?: string
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
}

export async function fetchOwnChannel(accessToken: string): Promise<OwnChannel | null> {
  const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null

  const json = await res.json() as {
    items?: { id: string; snippet: { title: string }; statistics: { subscriberCount?: string } }[]
  }
  const channel = json.items?.[0]
  if (!channel) return null

  return {
    channelId: channel.id,
    channelName: channel.snippet.title,
    subscriberCount: parseInt(channel.statistics.subscriberCount ?? '0', 10),
  }
}
