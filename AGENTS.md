<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-constraints -->
# UI/UX 디자인 제약조건

MVP 기능은 완성됐고 지금은 체계적인 UI/UX 개선 단계다. "예쁘게/세련되게" 같은 모호한 지시는 무난한(템플릿 같은) 결과로 이어지므로, 화면을 고칠 때는 항상 아래 제약을 기본으로 따른다.

## 금지 패턴 (AI 생성 디자인 기본값 — 쓰지 말 것)
- 그라데이션 남용, 글래스모피즘/블러 패널, 과한 그림자·글로우
- 보라-블루 그라데이션, 무분별한 `rounded-3xl`
- 새로 만드는 화면에서 이모지를 1차 아이콘으로 쓰는 것 (기존 이모지 아이콘 ♥ ⚑ ☰ ✕ 🔍 등은 해당 화면을 직접 손대는 게 아니면 그대로 둔다 — 일괄 교체 대상 아님)
- 중앙정렬 일변도 레이아웃, 장식용 일러스트, 자동재생 캐러셀

## 참조 앱과 가져올 것
- **구글맵**: 지도 중심 정보 밀도, 위치 버튼/리센터 동작, 바텀시트 드래그 패턴
- **에어비앤비**: 카드 위계, 필터 칩, 빈 상태 톤
- **당근마켓**: 모바일 퍼스트 한국형 UX, 거리/위치 칩, 단순한 플랫 컬러
- **토스**: 타이포그래피 위계, 색상은 의미 있을 때만 사용, 모션 절제

## 기존 톤 유지 규칙
- **소비자 UI 기본 톤 = 웜 미니멀**(에어비앤비 감성): 화면 배경은 미묘한 웜 `#FBF8F5`(카드는 흰색으로 배경 위에 뜨게), 1차 포인트는 코랄 `#D85A30`. 토큰은 `globals.css`의 `@theme`(`bg-warm`/`bg-surface`/`border-line`/`text-ink`/`bg-coral`/`text-coral`/`bg-coral-soft`/`text-coral-ink`/`text-confirm`/`bg-partner`)와 `DESIGN_SYSTEM.md` 참고. 화면 단위로 점진 적용 중.
- `accent = blue-600`은 이제 **admin/partner 화면 + 아직 웜 미니멀로 안 옮긴 소비자 잔여**에만 남는 레거시 — 소비자 선택/활성 상태는 코랄로 교체 진행. 새 액센트 컬러를 추가하려면 이 문서도 같이 갱신할 것
- **소비자 1차 CTA·선택탭 = 코랄**(검색하기·적용·제출·채널검색·영상보기·선택된 정렬/필터/탭). 문서상 `primary=black`은 **admin/partner + 본문·제목 텍스트**에만 남는 레거시 — 소비자 버튼을 검정으로 새로 만들지 말 것. (햄버거 네이비 헤더·파트너 랜딩 레드·마커색은 계속 유지)
- `header-dark = #0F1C2E` — 딥 네이비. 이제 **SplashScreen(로딩)·partner/admin 화면**에만 남는 레거시(MenuDrawer는 웜 미니멀로 전환됨). 소비자 지도 흐름에 새로 쓰지 말 것
- `panel-tint = #F8FAFF` — (사용처 없음/폐기) MenuDrawer 본문 전용이었으나 MenuDrawer가 `bg-warm`으로 이동해 미사용. 재사용 금지
- `warm-minimal` 팔레트 값: 코랄 `#D85A30` / 연코랄 배경 `#FAECE7`·텍스트 `#993C1D` / 확인 초록 `#1D9E75` / 파트너 골드 `#E8B84B` / 웜 배경 `#FBF8F5` / 중립 표면 `#faf7f5` / 테두리 `#f0e9e3`·`#ede4de` / 텍스트 `#2a2320`·보조 `#8a7a70`. (`PlaceInfoPanel.tsx`의 `C` 상수에 정의 → 소비자 UI 전역 톤으로 승격.)
- 웜 톤에서 **제외(기존 색 유지)**: 지도 마커색(골드/빨강/파랑 클러스터), 파트너 랜딩 레드(YouTube 맥락), 헤더 네이비(`header-dark`), 하트(amber/`favorite`)·가본곳(초록)
- 패널·버튼·인풋의 기본 radius는 `rounded-lg`. `rounded-full`은 원형 아이콘/탭 같은 pill류 전용 예외 (현재 `FavoritesOverlay.tsx`의 탭만 `rounded-full`로 `SearchMap.tsx`의 다른 탭들과 다름 — 화면 개선 단계에서 통일 대상)
- 이 저장소엔 `tailwind.config.ts`나 커스텀 색상/spacing 토큰이 없다. 토큰을 새로 정의하기 전까지는 기존 Tailwind 기본값 + 위 관례를 그대로 따른다

## 범위 우선순위
소비자 화면(`/`, 지도 검색 흐름)이 최우선이다. admin/partner 화면은 본인만 보는 화면이라 가장 마지막 — 별다른 지시 없이 UI 개선 범위를 admin/partner 쪽으로 넓히지 않는다.
<!-- END:design-constraints -->
