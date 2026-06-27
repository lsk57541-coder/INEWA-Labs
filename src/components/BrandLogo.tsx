// MAPTUBE 정식 로고 — 위치 핀 + 재생 삼각형 (코랄 #FF5C5C).
// 스플래시·메뉴·로그인 등 앱 UI에서 공유하는 단일 소스. 모양 변경 금지(자산 파일과 일치).
export function PinPlayIcon({ size = 80 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * 1.15);
  return (
    <svg width={w} height={h} viewBox="0 0 80 92" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 핀 외형 */}
      <path
        d="M40 4C23.4 4 10 17.4 10 34C10 53.5 40 88 40 88C40 88 70 53.5 70 34C70 17.4 56.6 4 40 4Z"
        fill="#FF5C5C"
      />
      {/* 핀 내부 원 (깊이감) */}
      <circle cx="40" cy="34" r="19" fill="rgba(0,0,0,0.18)" />
      {/* 핀 상단 하이라이트 */}
      <ellipse cx="33" cy="23" rx="7" ry="4.5" fill="rgba(255,255,255,0.18)" />
      {/* 재생 삼각형 */}
      <polygon points="34,24 34,44 54,34" fill="white" />
      {/* 하단 그림자 */}
      <ellipse cx="40" cy="91" rx="7" ry="2.5" fill="rgba(255,92,92,0.22)" />
    </svg>
  );
}
