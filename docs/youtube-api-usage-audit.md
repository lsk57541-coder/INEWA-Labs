# YouTube Data API 사용 전수 감사 (Compliance Review 대응)

YouTube API Compliance Review 답장/영상에 "우리가 실제로 호출하는 API"를 빠짐없이 기재하기
위해, 코드 전체를 읽기 전용으로 전수 조사해 호출하는 모든 YouTube Data API v3 엔드포인트를
목록화하고, 6/28 메일 주장(자막 미사용·댓글 조건부·캐시 TTL)과 코드의 일치 여부를 대조했다.
(이 문서 작성 시점 코드 수정 0)

모든 호출은 YouTube Data API v3, `https://www.googleapis.com/youtube/v3/...`.
인증은 서버측 API 키(대부분) + 파트너 온보딩만 OAuth 토큰.

---

## 1. 호출하는 엔드포인트 전수 목록 (5종)

### A. search.list (100 units/호출) — 4개 호출 지점
| 파일 | 파라미터 | 목적 | 트리거 |
|---|---|---|---|
| src/app/api/search/route.ts `ytSearch` | part=snippet, type=video, (location/locationRadius/publishedAfter/order 변형) | 소비자 키워드 검색(영상 후보 풀) | 사용자 키워드 검색 & 캐시 미스. 미스당 2~5회 |
| src/app/api/channel-search/route.ts | part=snippet, type=channel, q | 채널 자동완성(채널명으로 채널 찾기) | 사용자가 채널 검색 버튼 누를 때 1회 |
| src/app/api/partner/channel-videos/route.ts | part=snippet, type=video, channelId, order=date | 파트너 본인 채널 영상 목록(등록 UI) | 파트너가 장소등록 화면 열 때 |
| src/app/api/youtube/route.ts | part=snippet, type=video, q | **admin** 영상 검색(운영자 장소 등록) | 관리자만 |

### B. videos.list (1 unit/호출, 50개까지) — 5개 지점
| 파일 | part | 목적 | 트리거 |
|---|---|---|---|
| src/app/api/search/route.ts `fetchVideoDetails` | snippet,recordingDetails,statistics,contentDetails,player | 영상 메타(제목/설명/지오태그/조회수/영상비율) | 검색 결과 상세, 캐시 미스 |
| src/lib/extractPlaces.ts `getVideoSnippet` | snippet,statistics | 제목·설명으로 장소 추출 + 조회수 | 파트너 추출(extract-places) |
| src/app/api/partner/video-info/route.ts | snippet,statistics | 파트너 영상 미리보기(제목/썸네일/조회수) | 파트너 미리보기 |
| src/app/api/admin/video-info/route.ts | snippet,statistics | admin 영상 미리보기 | 관리자만 |
| scripts/backfill-metrics.mjs | snippet,statistics | 데모 조회수 backfill | **로컬 1회성 스크립트(런타임 아님)** |

### C. channels.list (1 unit/호출, 50개까지) — 6개 지점
| 파일 | part | 목적 | 트리거 |
|---|---|---|---|
| src/app/api/search/route.ts `getChannelSubscriberCounts` | statistics | 구독자수(금색 마커 티어) | 검색 결과, 캐시 미스 |
| src/app/api/search/route.ts `ytChannelUploads` | contentDetails | 채널 업로드 재생목록 ID 취득 | 채널 검색, 캐시 미스 |
| src/app/api/channel-search/route.ts | statistics | 채널 후보 구독자수 | 채널 검색 버튼 |
| src/lib/googleOAuth.ts `fetchOwnChannel` | snippet,statistics, **mine=true (OAuth 토큰)** | 파트너 채널 소유권 증명 + 채널명/구독자/썸네일 | 파트너 가입/재연동 |
| src/app/api/admin/video-info/route.ts | statistics | admin 채널 구독자수 | 관리자만 |
| scripts/backfill-metrics.mjs | statistics | 데모 구독자 backfill | 로컬 1회성 스크립트 |

### D. playlistItems.list (1 unit/호출, 50개까지) — 1개 지점
| 파일 | part | 목적 | 트리거 |
|---|---|---|---|
| src/app/api/search/route.ts `ytChannelUploads` | snippet | 채널 전체 영상 페이지네이션(search.list 대신 quota 절약) | 채널 검색, 캐시 미스 |

### E. commentThreads.list (1 unit/호출) — 1개 지점
| 파일 | part | 목적 | 트리거 |
|---|---|---|---|
| src/lib/extractFromComments.ts | snippet,replies, order=relevance, maxResults=20, textFormat=plainText | **폴백** 상호명 추출(제목 매칭 실패 시에만) | 소비자 검색 중 `!titleMatch?.name`일 때만 |

- ★댓글 호출 가드: src/app/api/search/route.ts 3개 지점(약 841·903·980행) 전부
  `const commentMatch = !titleMatch?.name ? await extractPlaceFromComments(...) : ...` →
  **제목(Kakao) 매칭이 실패한 경우에만** 댓글을 읽음. 무조건 호출 아님.

---

## 2. 사용하지 않는 API (심사 중요)
- **captions (자막) API: 전혀 사용 안 함.** 코드 전체 grep 결과 `captions`/`timedtext`/자막
  다운로드 호출 0건. 6/28 메일의 "자막 안 씀" 주장과 **코드 일치**.
- activities/subscriptions/playlists(생성)/기타 쓰기(write) API: 사용 안 함(전부 읽기 전용 list).

## 3. 캐싱 (src/app/api/search/route.ts)
- `search_cache` 테이블에 search.list/채널 결과 캐시:
  - **키워드 검색: 20분** (`SEARCH_CACHE_TTL_MS = 20*60*1000`)
  - **채널 검색: 24시간** (`CHANNEL_CACHE_TTL_MS = 24*60*60*1000`)
- videos.list/channels.list는 DB 캐시는 없고 fetch `revalidate`(300s/3600s)만.
- 6/28 메일의 "키워드 20분 / 채널 24시간" 주장과 **코드 일치**.

## 4. 6/28 메일 주장 vs 코드 대조
| 메일 주장 | 코드 실제 | 판정 |
|---|---|---|
| 자막(captions) 미사용 | captions 호출 0건 | ✅ 일치 |
| 댓글은 다른 매칭 실패 시에만 | `!titleMatch?.name`일 때만 commentThreads | ✅ 일치 |
| 키워드 검색 20분 캐시 | SEARCH_CACHE_TTL_MS=20분 | ✅ 일치 |
| 채널 검색 24시간 캐시 | CHANNEL_CACHE_TTL_MS=24시간 | ✅ 일치 |

## 5. 심사 답장용 "정확한 API 사용 명세" 초안 재료
사용 엔드포인트(5): **search.list, videos.list, channels.list, playlistItems.list,
commentThreads.list** — 전부 읽기 전용(list). 자막·쓰기 API 미사용.
- 핵심 용도: 지역/채널 검색으로 관련 영상 발견(search·playlistItems) → 메타데이터로
  장소·지오태그 해석(videos) → 창작자 신뢰도(구독자수) 표시(channels) → 제목으로 장소를
  못 찾을 때만 댓글로 보강(commentThreads).
- 파트너 온보딩은 OAuth(`mine=true`)로 채널 소유권만 확인(channels.list).
- quota 절감: 키워드 결과 20분·채널 결과 24시간 캐시, 채널 영상은 search.list(100u) 대신
  playlistItems(1u)로, 폴백 검색은 후보 부족 시에만.

## 6. 심사에서 물을 수 있는 지점 (주의/미리 대비)
- **admin/내부 도구도 API 사용**(api/youtube, api/admin/video-info) — 답장에서 누락 금지.
- **로컬 스크립트**(backfill-metrics.mjs)도 videos/channels.list 호출 — "런타임 아님, 1회성
  데모 backfill"로 명시하면 오해 방지.
- **OAuth 스코프**: 파트너 연동은 youtube.readonly 성격(channels mine=true). API 키 경로와
  구분해 기재.
- **데이터 저장/보존**(심사가 흔히 물음, 이번 조사 범위 밖이나 플래그): video_id·제목·
  썸네일 URL·채널명·조회수·구독자수·업로드일을 DB(places/videos/favorites/search_cache)에
  저장 중. 답장 준비 시 저장 항목·보존/삭제 정책도 같이 정리 권장.
