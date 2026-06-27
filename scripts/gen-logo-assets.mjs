// MAPTUBE 로고 자산 생성 (로컬 실행 전용). `node scripts/gen-logo-assets.mjs`
// 소스 = BrandLogo.PinPlayIcon과 동일한 핀 SVG. sharp로 래스터화.
// OG의 한글 텍스트는 시스템 Malgun(rsvg+pango+fontconfig)으로 렌더 → 결과 PNG를 육안 확인할 것.
import sharp from 'sharp'
import { writeFile, mkdir } from 'node:fs/promises'

const CORAL = '#FF5C5C'
const NAVY = '#0F1C2E'

// 핀 내부 요소(아웃터 svg 없이) — 자산용은 바닥 그림자 생략(아이콘엔 '바닥'이 없음)
const PIN_INNER = `
  <path d="M40 4C23.4 4 10 17.4 10 34C10 53.5 40 88 40 88C40 88 70 53.5 70 34C70 17.4 56.6 4 40 4Z" fill="${CORAL}"/>
  <circle cx="40" cy="34" r="19" fill="rgba(0,0,0,0.18)"/>
  <ellipse cx="33" cy="23" rx="7" ry="4.5" fill="rgba(255,255,255,0.18)"/>
  <polygon points="34,24 34,44 54,34" fill="white"/>
`

// 핀을 (배경 위) 캔버스 중앙에 배치한 정사각 SVG. pinH = 핀 높이(px).
function squareIcon(canvas, pinH, bg) {
  const s = pinH / 92
  const w = 80 * s
  const tx = (canvas - w) / 2
  const ty = (canvas - pinH) / 2
  const bgRect = bg ? `<rect width="${canvas}" height="${canvas}" fill="${bg}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
    ${bgRect}
    <g transform="translate(${tx} ${ty}) scale(${s})">${PIN_INNER}</g>
  </svg>`
}

// 1200x630 OG 카드
function ogCard() {
  const pinH = 150
  const s = pinH / 92
  const pw = 80 * s
  const tx = (1200 - pw) / 2
  const ty = 96
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${NAVY}"/>
    <g transform="translate(${tx} ${ty}) scale(${s})">${PIN_INNER}</g>
    <text x="600" y="380" text-anchor="middle" font-family="Geist, Arial, sans-serif" font-size="96" font-weight="700" letter-spacing="10" fill="#FFFFFF">MAPTUBE</text>
    <rect x="570" y="418" width="60" height="4" rx="2" fill="${CORAL}"/>
    <text x="600" y="492" text-anchor="middle" font-family="Malgun Gothic, AppleSDGothicNeo, sans-serif" font-size="42" font-weight="500" fill="rgba(255,255,255,0.92)">영상 속 장소를 지도로</text>
  </svg>`
}

// 일반 로고(투명 배경 핀) — viewBox 0 0 80 92
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="92" viewBox="0 0 80 92" fill="none">${PIN_INNER}</svg>`
// favicon(Next app/icon.svg) — 둥근 네이비 배경 + 핀
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${NAVY}"/>
  <g transform="translate(${(64 - 80 * (44 / 92)) / 2} ${(64 - 44) / 2}) scale(${44 / 92})">${PIN_INNER}</g>
</svg>`

await mkdir('public', { recursive: true })

// SVG 파일들
await writeFile('public/logo.svg', logoSvg)
await writeFile('src/app/icon.svg', faviconSvg)

// PWA maskable 아이콘 (네이비 배경, 안전영역 위해 핀 높이 = 캔버스 55%)
await sharp(Buffer.from(squareIcon(192, Math.round(192 * 0.55), NAVY))).png().toFile('public/icon-192.png')
await sharp(Buffer.from(squareIcon(512, Math.round(512 * 0.55), NAVY))).png().toFile('public/icon-512.png')
// apple touch (180, 불투명 네이비)
await sharp(Buffer.from(squareIcon(180, Math.round(180 * 0.55), NAVY))).png().toFile('src/app/apple-icon.png')
// OG
await sharp(Buffer.from(ogCard())).png().toFile('public/og.png')

console.log('생성 완료: public/{logo.svg,icon-192.png,icon-512.png,og.png}, src/app/{icon.svg,apple-icon.png}')
