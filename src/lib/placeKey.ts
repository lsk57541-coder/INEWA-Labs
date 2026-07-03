// 찜/가본곳 식별키(단일 출처). 모음영상은 같은 videoId가 여러 좌표(가게)로 뜨므로
// videoId만으론 한 곳 찜이 전체로 번진다 → videoId+좌표로 장소별 구분(좌표 5자리=약 1m).
// ★저장(favoriteIds Set)·조회(FavoritesOverlay 필터) 양쪽이 반드시 이 함수를 써야 한다.
//   각자 문자열을 조립하면 한쪽만 바뀌어 키가 어긋난다(2026-06-28 복합키 전환 때 실제 발생).
export function placeKey(videoId: string, lat: number, lng: number): string {
  return `${videoId}:${lat.toFixed(5)}:${lng.toFixed(5)}`
}
