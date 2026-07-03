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
- 베이스는 검정/흰색. 새 액센트 컬러를 추가하려면 이 문서도 같이 갱신할 것 — 기본 1차 액센트는 `blue-600` 하나로 유지
- `header-dark = #0F1C2E` — 앱 헤더(MenuDrawer, SplashScreen)에만 쓰는 딥 네이비. 다른 영역에 확장 금지
- `panel-tint = #F8FAFF` — MenuDrawer 본문 배경에만 쓰는 극연한 네이비 틴트. 지도 화면 등 다른 영역 확장 금지
- `warm-minimal` 팔레트 — **`PlaceDetailCard.tsx`(장소 상세 카드) 전용**. 소비자에게 파트너 차별점을 보여주는 모집 쇼윈도 surface라 웜 미니멀(에어비앤비 감성)로 예외: 코랄 `#D85A30` / 연코랄 `#FAECE7`·텍스트 `#993C1D` / 확인 초록 `#1D9E75`. 이 팔레트는 PlaceDetailCard에 한정하며 **다른 UI로 전파 금지** — 나머지 화면은 기존 `blue-600` 1차 액센트 유지
- 패널·버튼·인풋의 기본 radius는 `rounded-lg`. `rounded-full`은 원형 아이콘/탭 같은 pill류 전용 예외 (현재 `FavoritesOverlay.tsx`의 탭만 `rounded-full`로 `SearchMap.tsx`의 다른 탭들과 다름 — 화면 개선 단계에서 통일 대상)
- 이 저장소엔 `tailwind.config.ts`나 커스텀 색상/spacing 토큰이 없다. 토큰을 새로 정의하기 전까지는 기존 Tailwind 기본값 + 위 관례를 그대로 따른다

## 범위 우선순위
소비자 화면(`/`, 지도 검색 흐름)이 최우선이다. admin/partner 화면은 본인만 보는 화면이라 가장 마지막 — 별다른 지시 없이 UI 개선 범위를 admin/partner 쪽으로 넓히지 않는다.
<!-- END:design-constraints -->
