'use client'

import { useState } from 'react'

// 영상행 길찾기 버튼이 쓰는 NaviIcon(SearchMap.tsx:243-253)과 동일한 모양을 복제.
// (그 컴포넌트는 export되지 않으므로 앱 버튼은 건드리지 않고 같은 SVG만 재현.)
function NaviGlyph() {
  return (
    <svg viewBox="0 0 28 28" className="w-5 h-5 shrink-0" aria-hidden>
      <rect width="28" height="28" rx="8" fill="#FEE500" />
      <polygon points="14,6 19,21 14,17.5 9,21" fill="#3C1E1E" />
    </svg>
  )
}

// 채널 검색 흐름 도식(실제 스크린샷 아님). ①탭 → ②채널명 입력 → ③전국에 핀.
// AGENTS.md: 그라데이션 X, 웜 미니멀 코랄 포인트, 반응형 viewBox.
function ChannelFlowDiagram() {
  const BLUE = '#D85A30'
  return (
    <svg viewBox="0 0 320 104" className="w-full h-auto mt-2" role="img" aria-label="채널 검색 흐름: 채널 검색 탭 선택 → 채널명 입력 → 전국 지도에 핀 표시">
      {/* ① 탭 */}
      <g>
        <rect x="8" y="20" width="80" height="26" rx="13" fill="#FAECE7" stroke={BLUE} strokeWidth="1.5" />
        <text x="48" y="37" textAnchor="middle" fontSize="11" fill={BLUE} fontWeight="600">🎙 채널 검색</text>
        <circle cx="14" cy="16" r="8" fill={BLUE} />
        <text x="14" y="20" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">1</text>
        <text x="48" y="64" textAnchor="middle" fontSize="9" fill="#9ca3af">탭 선택</text>
      </g>
      {/* arrow */}
      <path d="M94 33 H114" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M110 29 L116 33 L110 37 Z" fill="#cbd5e1" />
      {/* ② 입력 */}
      <g>
        <rect x="120" y="20" width="84" height="26" rx="6" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
        <text x="162" y="37" textAnchor="middle" fontSize="11" fill="#6b7280">@채널명</text>
        <circle cx="126" cy="16" r="8" fill={BLUE} />
        <text x="126" y="20" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">2</text>
        <text x="162" y="64" textAnchor="middle" fontSize="9" fill="#9ca3af">채널명 입력</text>
      </g>
      {/* arrow */}
      <path d="M210 33 H230" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M226 29 L232 33 L226 37 Z" fill="#cbd5e1" />
      {/* ③ 전국 지도 + 핀 */}
      <g>
        <rect x="236" y="16" width="76" height="56" rx="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        {[[250, 30], [272, 24], [292, 40], [258, 52], [284, 58]].map(([cx, cy], i) => (
          <g key={i}>
            <path d={`M${cx} ${cy} c-4 0 -7 3 -7 7 c0 5 7 11 7 11 c0 0 7 -6 7 -11 c0 -4 -3 -7 -7 -7 z`} fill={BLUE} />
            <circle cx={cx} cy={cy + 7} r="2.4" fill="#fff" />
          </g>
        ))}
        <circle cx="242" cy="16" r="8" fill={BLUE} />
        <text x="242" y="20" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">3</text>
        <text x="274" y="86" textAnchor="middle" fontSize="9" fill="#9ca3af">전국 지도에 핀</text>
      </g>
    </svg>
  )
}

interface GuideItem {
  icon?: React.ReactNode
  title: string
  body: React.ReactNode
}

const ITEMS: GuideItem[] = [
  {
    icon: <span className="text-lg">🎙</span>,
    title: '유튜브 채널로 전국 검색',
    body: (
      <>
        채널명으로 검색하면 <strong>그 채널이 소개한 장소가 전국 지도에 한눈에</strong> 떠요.
        <br />
        검색창을 펼치면 나오는 상단 <strong>“🎙 채널 검색”</strong> 탭에서 채널명을 입력하세요.
        <ChannelFlowDiagram />
      </>
    ),
  },
  {
    icon: <span className="text-lg">🔍</span>,
    title: '지역·키워드 검색',
    body: (
      <>
        <strong>“강남 맛집”, “제주 카페”</strong>처럼 지역과 키워드를 함께 검색하세요.
        <br />
        고급 설정에서 <strong>검색 위치를 직접 지정</strong>할 수도 있어요.
        <span className="block mt-2 text-xs text-ink-muted bg-coral-soft rounded-lg px-3 py-2 leading-relaxed">
          💡 유튜버가 영상에서 직접 소개한 장소를 모아 보여줘요. <strong>인기 장소가 강점</strong>이고,
          영상에 안 나온 곳은 결과가 적을 수 있어요.
        </span>
      </>
    ),
  },
  {
    icon: <span className="text-lg">📍</span>,
    title: '반경 조절',
    body: (
      <>
        검색 범위를 <strong>km 단위로 늘리거나 줄여</strong> 가까운 곳만, 또는 넓은 범위를 탐색하세요.
        <br />
        검색창을 펼치면 나오는 km 버튼에서 조절합니다. (채널 검색은 전국 표시라 반경이 없어요.)
      </>
    ),
  },
  {
    icon: <span className="text-lg">⚙️</span>,
    title: '결과 필터',
    body: (
      <>
        결과가 많을 때 <strong>영상 유형·조회수·구독자·기간</strong>으로 좁힐 수 있어요.
        <br />
        화면 <strong>우상단 필터 버튼</strong>을 누르세요.
      </>
    ),
  },
  {
    icon: <span className="text-lg">❤️</span>,
    title: '찜 · 가본곳',
    body: (
      <>
        영상 카드의 <strong>하트(❤️)로 찜</strong>, <strong>체크(✓)로 “가봤어요”</strong>를 표시해요.
        <br />
        저장한 곳은 메뉴 ☰ → <strong>“관심목록”</strong>에서 다시 볼 수 있어요.
      </>
    ),
  },
  {
    icon: <NaviGlyph />,
    title: '길찾기',
    body: (
      <>
        영상 옆 <strong>나침반 아이콘</strong>을 누르면 <strong>카카오맵 길찾기</strong>로 바로 연결돼요.
      </>
    ),
  },
]

// 일반 사용자용 FAQ(파트너 신청 페이지 FAQ와 별개). 질문-답변 형식, 기능 안내와 같은 톤.
// 4·5번 답변의 "문의하기/파트너 신청하기"는 메뉴 항목 — 문의 기능은 후속 작업에서 추가 예정이라
// 지금은 문구만 두고 링크는 걸지 않는다.
const FAQ_ITEMS: GuideItem[] = [
  {
    icon: <span className="text-base">✅</span>,
    title: '유튜버 영상을 써도 되나요? 저작권 문제는 없나요?',
    body: (
      <>
        MAPTUBE는 <strong>YouTube 공식 API</strong>로 영상 정보(제목·썸네일·링크)를 가져와,
        지도에서 <strong>원본 영상으로 바로 연결</strong>해 드려요. 영상을 따로 복제하거나 다시 올리지 않고,
        클릭하면 유튜브에서 재생돼요. 영상의 조회수와 트래픽은 그대로 <strong>창작자에게 돌아가고</strong>,
        오히려 새 시청자가 찾아오는 통로가 됩니다.
      </>
    ),
  },
  {
    icon: <span className="text-base">💰</span>,
    title: '무료인가요?',
    body: <>네, 무료로 쓸 수 있어요.</>,
  },
  {
    icon: <span className="text-base">🔍</span>,
    title: '검색했는데 결과가 적어요',
    body: (
      <>
        MAPTUBE는 <strong>유튜버가 영상에서 직접 소개한 장소</strong>를 모아 보여줘요.
        아직 영상에 안 나온 곳은 결과가 적을 수 있어요.
      </>
    ),
  },
  {
    icon: <span className="text-base">🔑</span>,
    title: '로그인 안 하면 못 쓰나요?',
    body: (
      <>
        검색·지도는 <strong>로그인 없이</strong> 둘러볼 수 있어요. 찜·가본곳 저장과 문의하기는 로그인이 필요해요.
      </>
    ),
  },
  {
    icon: <span className="text-base">📍</span>,
    title: '장소 정보가 틀렸어요',
    body: <>메뉴의 <strong>“문의하기”</strong>로 알려주시면 확인할게요.</>,
  },
  {
    icon: <span className="text-base">🎬</span>,
    title: '제 유튜브 채널도 올릴 수 있나요?',
    body: (
      <>
        네! 메뉴의 <strong>“파트너 신청하기”</strong>에서 채널을 연동하면 영상 속 장소가 지도에 표시돼요.
      </>
    ),
  },
]

// 단일 오픈 아코디언(기능 안내·FAQ 공용). defaultOpen=-1이면 전부 닫힌 상태로 시작.
// qa=true면 FAQ용 Q&A 시각화(질문 앞 Q 배지 + 답변 앞 A 배지). qa=false(기본)는 기능 안내 — 기존 렌더 그대로.
function Accordion({ items, defaultOpen = -1, qa = false }: { items: GuideItem[]; defaultOpen?: number; qa?: boolean }) {
  const [openIdx, setOpenIdx] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const open = openIdx === i
        return (
          <div key={i} className="border border-line rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpenIdx(open ? -1 : i)}
              aria-expanded={open}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-surface transition"
            >
              {qa && (
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md bg-coral text-white text-[11px] font-bold">Q</span>
              )}
              {item.icon && <span className="shrink-0 flex items-center justify-center w-6">{item.icon}</span>}
              <span className="flex-1 text-sm font-semibold text-ink">{item.title}</span>
              <span className="shrink-0 text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              qa ? (
                <div className="px-4 pb-4 flex gap-2 items-start">
                  <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-200 text-gray-600 text-[11px] font-bold">A</span>
                  <div className="text-sm text-gray-600 leading-relaxed">{item.body}</div>
                </div>
              ) : (
                <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">
                  {item.body}
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function GuideContent() {
  return (
    <div>
      {/* 기능 안내 — 1번(채널 검색) 기본 펼침 */}
      <Accordion items={ITEMS} defaultOpen={0} />

      <p className="mt-6 text-sm text-ink-muted bg-white border border-line rounded-lg px-4 py-3 leading-relaxed">
        💡 지도 위 <strong>마커(핀)를 탭</strong>하면 그 장소가 나온 <strong>유튜브 영상</strong>이 바로 열려요.
      </p>

      {/* 자주 묻는 질문 — 기능 안내와 구분되는 별도 섹션 */}
      <div className="mt-8 pt-6 border-t border-line">
        <h2 className="text-sm font-bold text-ink mb-3">자주 묻는 질문</h2>
        <Accordion items={FAQ_ITEMS} qa />
      </div>
    </div>
  )
}
