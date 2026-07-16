// Temporary hand-off between the YouTube OAuth callback and the partner
// application form: the channel is verified before the rest of the form
// (categories/region/agreement) is filled in, so it has nowhere to live yet
// except a short-lived httpOnly cookie. Never sent to client JS.
export const PENDING_CHANNEL_COOKIE = 'yt_pending_channel'
export const PENDING_CHANNEL_MAX_AGE_SEC = 10 * 60

// ★ OAuth 토큰 필드를 두지 않는다. 소유권 증명은 이 객체가 만들어지기 전에
// fetchOwnChannel로 이미 끝나 있으므로, 여기 담을 이유가 없다. 필드가 없으면
// 토큰이 이 쿠키로 새어나가는 경로 자체가 구조적으로 성립하지 않는다.
export interface PendingChannel {
  channelId: string
  channelName: string
  subscriberCount: number
  thumbnail: string | null
}

// The subset of PendingChannel that's safe to render — props get serialized
// into the page payload, so keep this to what the form actually needs.
export type PublicChannelInfo = Pick<PendingChannel, 'channelId' | 'channelName' | 'subscriberCount'>

export function toPublicChannelInfo(channel: PendingChannel): PublicChannelInfo {
  return { channelId: channel.channelId, channelName: channel.channelName, subscriberCount: channel.subscriberCount }
}
