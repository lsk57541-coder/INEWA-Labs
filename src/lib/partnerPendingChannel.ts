// Temporary hand-off between the YouTube OAuth callback and the partner
// application form: the channel is verified before the rest of the form
// (categories/region/agreement) is filled in, so it has nowhere to live yet
// except a short-lived httpOnly cookie. Never sent to client JS.
export const PENDING_CHANNEL_COOKIE = 'yt_pending_channel'
export const PENDING_CHANNEL_MAX_AGE_SEC = 10 * 60

export interface PendingChannel {
  channelId: string
  channelName: string
  subscriberCount: number
  accessToken: string
  refreshToken: string | null
}

// The subset of PendingChannel that's safe to render — never pass the full
// object (with tokens) into a client component, since props get serialized
// into the page payload.
export type PublicChannelInfo = Pick<PendingChannel, 'channelId' | 'channelName' | 'subscriberCount'>

export function toPublicChannelInfo(channel: PendingChannel): PublicChannelInfo {
  return { channelId: channel.channelId, channelName: channel.channelName, subscriberCount: channel.subscriberCount }
}
