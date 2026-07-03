# 디자인 시스템

`UI_AUDIT.md`에서 발견된 문제(액센트 컬러가 선택상태/액션버튼에 혼용됨, 테두리 색상 불일치, 라디우스 불일치)를 해결하기 위해 정의한 토큰. 새 색상을 발명하지 않고 **이미 코드 전체에서 반복적으로 쓰이던 Tailwind 기본 팔레트에 "역할(의미)"을 부여**하는 방식을 택했다 — 처음부터 새 브랜드 컬러를 만드는 대신, 지금까지 암묵적으로 따르던 관례(검정/흰색 베이스, 블루 액센트, gray 중립톤)를 명시적인 규칙으로 고정한 것. 템플릿처럼 보이지 않으려고 화려한 그라데이션이나 새 액센트를 추가하는 대신, "어디에 어떤 색을 쓸지"를 더 엄격하게 정하는 쪽으로 갔다 (토스 참조: 색상은 의미 있을 때만).

토큰은 `src/app/globals.css`의 `@theme inline` 블록에 정의되어 있고, Tailwind v4가 자동으로 `bg-accent`, `text-danger`, `border-border` 같은 유틸리티 클래스를 생성한다.

## 색상

| 토큰 | 값 | 역할 | 쓰지 말 것 |
|---|---|---|---|
| `accent` (`bg-accent`/`text-accent`/`border-accent`) | `blue-600` | **선택/활성 상태 표시 전용** — 탭/칩이 선택됐을 때, 인풋 포커스 링 | 클릭 가능한 액션 버튼에 쓰지 말 것 (지금 검색 패널의 작은 "검색" 버튼이 이 규칙을 어기고 있음 — 4단계에서 수정 대상) |
| `primary` — 소비자=`bg-coral`, admin/partner=`bg-black` | coral / black | **1차 액션 버튼·선택탭** (검색하기·적용·제출·채널검색·영상보기·선택된 탭). 소비자 화면은 **코랄**, admin/partner는 검정 레거시 | 보조 액션엔 쓰지 말 것 → `bg-surface`(소비자)/`bg-gray-100`; 본문·제목의 검정 텍스트는 그대로(버튼 아님) |
| `favorite` (`text-favorite`/`bg-favorite`) | `amber-400` (금색) | 찜/즐겨찾기 표시 (하트, 마커) | 일반 강조 색으로 쓰지 말 것 |
| `navigate` (`bg-navigate`/`text-navigate`) | `amber-500` | 길찾기/내비 버튼 (카카오내비 톤 유지) | favorite와 헷갈리지 않게 둘을 같은 화면에 쓸 때 형태(원형 vs 하트)로 구분 |
| `danger` (`text-danger`/`bg-danger`) | `red-500` | 신고, 경고, 삭제 | 즐겨찾기 표시엔 쓰지 말 것(현재 즐겨찾기 탭 활성색이 red인 화면이 있음 — 4단계에서 favorite 토큰으로 교체 대상) |
| `muted` (`text-muted`) | `gray-400` | 보조 텍스트, 캡션, placeholder | 본문 텍스트엔 쓰지 말 것 |
| `border` (`border-border`) | `gray-200` | 기본 테두리 — 명시적 색 지정 없는 모든 `border`는 이걸로 통일 | — |

### 웜 미니멀 소비자 톤 (2차 — 소비자 UI 전역 통일)

`PlaceDetailCard`에서 확정한 웜 미니멀 팔레트를 소비자 UI 전역 포인트로 승격. Tailwind v4 `@theme`에 등록돼 유틸이 자동 생성된다. **라이트 전용**(앱 다크모드 미지원 — 한 벌). 화면 단위로 점진 적용.

| 토큰 | 값 | 역할 |
|---|---|---|
| `coral` (`bg-coral`/`text-coral`/`border-coral`) | `#D85A30` | **소비자 1차 포인트** — 선택/활성 상태, 주요 CTA. 소비자 화면에서 `accent`(blue-600) 대체 |
| `coral-soft` (`bg-coral-soft`) / `coral-ink` (`text-coral-ink`) | `#FAECE7` / `#993C1D` | 연코랄 배경 + 그 위 텍스트(보조 버튼·태그) |
| `confirm` (`text-confirm`/`bg-confirm`) | `#1D9E75` | 파트너 확인 배지 초록 |
| `partner` (`bg-partner`/`text-partner`) | `#E8B84B` | 파트너 골드 표식 |
| `warm` (`bg-warm`) | `#FBF8F5` | 화면 배경(미묘한 웜). 카드는 흰색 유지 |
| `surface` (`bg-surface`) | `#faf7f5` | 중립 표면(보조 버튼 배경 등) |
| `line` / `line-strong` (`border-line`) | `#f0e9e3` / `#ede4de` | 웜 톤 테두리 |
| `ink` / `ink-muted` (`text-ink`) | `#2a2320` / `#8a7a70` | 웜 톤 본문/보조 텍스트 |

**제외(웜 톤으로 바꾸지 말 것):** 지도 마커색, 파트너 랜딩 레드(YouTube 맥락), 헤더 네이비(`header-dark`), 하트(`favorite`)·가본곳(초록). `accent`(blue-600)는 admin/partner + 미마이그레이션 소비자 잔여에만 남는 레거시.

## 타이포그래피

- 폰트: Geist Sans 사용 (body의 `font-family`가 Arial로 하드코딩되어 Geist 변수가 죽은 코드였던 버그를 `globals.css`에서 수정함 — `var(--font-sans)`를 우선 적용하고 Arial/Helvetica는 fallback으로만 남김)
- 별도 커스텀 폰트 스케일은 만들지 않음 — Tailwind 기본 스케일(`text-xs`~`text-xl`)을 그대로 쓰되, 역할별 굵기/크기 규칙만 고정:
  - 화면 제목: `text-xl font-bold`
  - 카드 제목/장소명: `font-bold` (크기는 맥락에 따라 `text-sm`~`text-base`)
  - 본문: `text-sm`, 기본 굵기
  - 보조 정보(거리, 조회수, 날짜): `text-xs text-muted`

## Spacing & Radius

- spacing은 새로 정의하지 않음 — 코드 전체에서 이미 일관되게 쓰이던 Tailwind 기본 스케일 그대로 유지 (`p-3`/`p-4` 카드 패딩, `px-3 py-2` 버튼/인풋, `gap-1.5`/`gap-2` 아이콘-텍스트 간격)
- radius 규칙: **`rounded-lg`가 기본값** — 카드, 버튼, 인풋, 모달. `rounded-full`은 **pill/원형 전용 예외** — 아바타, 원형 아이콘 버튼, 그리고 "필터형 선택" 칩(탭, 반경 선택 등 — 현재 `rounded-lg`로 돼 있는 게 다음 단계에서 통일 대상)

## 적용 안 한 것 (다음 단계 메모)

메인 지도 화면(`SearchMap.tsx`, `FavoritesOverlay.tsx`) 1차 개선에서 아래 항목을 토큰으로 교체 완료했다 (자세한 내용은 `UI_AUDIT.md` 참고):

1. ✅ 검색 패널 소형 "검색" 버튼: `bg-blue-600` → `bg-gray-100`(보조 액션)으로 교체해 `accent`(선택상태 전용)와 분리
2. ✅ 검색모드 탭/반경 칩/정렬 칩/즐겨찾기 탭: `rounded-lg` → `rounded-full`로 통일, 선택 색은 `bg-accent`로 통일
3. ✅ 결과 카드 찜(♥)/신고(🚩) 아이콘이 둘 다 `red-500`이라 색만으론 구분 안 되던 문제 → 찜은 `text-favorite`, 신고는 `text-danger`로 분리 (당초 즐겨찾기 *탭* 활성색은 "찜" 의미가 아니라 범용 선택 표시였음이 확인되어 `favorite` 대신 `accent`로 정정 적용)

남은 항목:
4. ✅ 테두리 색이 암묵적으로 기본값에 의존하던 곳들 → `border-border`로 명시. 소비자 3개 화면(`SearchMap.tsx`/`FavoritesOverlay.tsx`/`MenuDrawer.tsx`) 총 28곳 통일. Tailwind v4부터 색 없는 `border`의 기본값이 `gray-200`이 아니라 `currentColor`라, 색 없이 쓰던 `border`들이 텍스트색으로 진하게 렌더링되던 걸 `border-border`(gray-200)로 정상화한 것(단순 토큰화가 아니라 실제 톤 개선). 의도적으로 다른 회색(`gray-100`/`300`/`800`), 의미색(`border-accent`/`black`/`blue-500`, 탭 언더라인), 모양용 border(재생삼각형/마커 SVG)는 제외.
5. admin/partner 화면 — 우선순위상 가장 마지막 (미착수)
