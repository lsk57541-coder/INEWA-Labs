export type TrackEvent = 'place_click' | 'embed_play' | 'kakao_share'

// 트래픽 계측 fire-and-forget. ★어떤 경우에도 throw하지 않고 await하지 않는다 —
// 영상 재생/마커 클릭/공유가 계측 때문에 지연·차단되면 안 됨.
// placeId가 없으면(비파트너/admin 검색결과) 아무것도 보내지 않는다.
// sendBeacon 우선(페이지 이탈에도 전송 보장), 미지원 시 keepalive fetch 폴백.
export function track(placeId: string | undefined, event: TrackEvent): void {
  if (!placeId) return
  try {
    const body = JSON.stringify({ placeId, event })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // 무시 — 계측은 부가기능이며, 실패해도 사용자 행동은 그대로 진행된다.
  }
}
