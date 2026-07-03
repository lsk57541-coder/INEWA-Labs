'use client'

import type { VideoResult } from '@/app/api/search/route'

// address에서 행정구역(구/군 + 동/읍/면) 토큰만 뽑아 동명 장소 구분용 지역 힌트를 만든다.
// 예) "광주광역시 남구 양림동 123-4" → "남구 양림동". 도로명 주소면 "남구"까지만 잡힐 수 있음.
function extractRegion(address?: string): string {
  if (!address) return ''
  return address
    .split(/\s+/)
    .filter((t) => /(구|군|동|읍|면)$/.test(t))
    .slice(0, 2)
    .join(' ')
}

// 소비자 장소 상세 카드(모바일 우선 바텀시트). 파트너 차별점(PARTNER 배지·채널정보)을
// 소비자에게 가시화하는 "모집 쇼윈도". 순수 프레젠테이셔널 — 찜/공유/재생은 부모(SearchMap)의
// 기존 핸들러를 props로 주입받아 재사용한다(재생 로직 PlayerFrame 무변경).
//
// ★단계 2: 컴포넌트만 신설. 마커/리스트 클릭 흐름 연결은 단계 3에서.
interface PlaceDetailCardProps {
  video: VideoResult
  isPartner: boolean            // 부모의 isPartnerVideo(v) 결과(실제/데모 파트너 포함)
  favorited: boolean
  onPlay: () => void            // = 부모 setSelectedVideo(video) (기존 재생 진입)
  onToggleFavorite: () => void  // = 부모 handleToggleFavorite(video)
  onShare: () => void           // = 부모 handleShare(video)
  onClose: () => void
}

export default function PlaceDetailCard({
  video, isPartner, favorited, onPlay, onToggleFavorite, onShare, onClose,
}: PlaceDetailCardProps) {
  const name = video.placeName ?? video.title
  // 카카오맵 장소 검색 링크 — 순수 URL 조립(SDK/REST 미사용 = 무비용). 길찾기(link/map) 대신
  // link/search로 그 장소의 검색 결과를 연다. 상호명 + 지역(구/동)으로 동명 장소 구분.
  const region = extractRegion(video.address)
  const kakaoQuery = region ? `${name} ${region}` : name
  const kakaoMapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(kakaoQuery)}`
  const isConfirmed = video.verificationStatus === 'confirmed'

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center md:items-center" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단: 썸네일 + PARTNER 배지 */}
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.thumbnail} alt="" className="w-full aspect-video object-cover bg-gray-100" />
          {isPartner && (
            <span className="absolute top-2.5 left-2.5 rounded bg-[#FFD700] px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-[#5c4600] tracking-wide shadow-sm">
              PARTNER
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center text-lg leading-none hover:bg-black/60"
          >
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {/* 제목행: 상호명 + 카테고리 + ✓확인 배지(confirmed일 때만) */}
          <div className="flex items-start gap-2 flex-wrap">
            <h2 className="text-lg font-bold leading-snug min-w-0">{name}</h2>
            {video.category && (
              <span className="shrink-0 mt-1 text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                {video.category.split(' > ').at(-1)}
              </span>
            )}
            {isConfirmed && (
              <span className="shrink-0 mt-1 inline-flex items-center gap-0.5 text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                파트너 확인
              </span>
            )}
          </div>

          {/* 정보행: 채널명 · 주소 · 거리 */}
          <div className="mt-2 text-sm text-gray-600 space-y-1">
            {video.channel && <p className="truncate">{video.channel}</p>}
            {video.address && <p className="text-gray-500 leading-snug">{video.address}</p>}
            <p className="text-xs font-bold text-blue-600">현재 위치에서 {video.distanceKm}km</p>
          </div>

          {/* 액션행 */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onPlay}
              className="flex-1 h-11 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              영상 보기
            </button>
            <a
              href={kakaoMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-11 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold flex items-center justify-center hover:bg-gray-50 transition"
            >
              카카오맵
            </a>
            <button
              onClick={onToggleFavorite}
              aria-label="찜하기"
              aria-pressed={favorited}
              className="w-11 h-11 shrink-0 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={favorited ? '#f59e0b' : 'none'} stroke={favorited ? '#f59e0b' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button
              onClick={onShare}
              aria-label="공유하기"
              className="w-11 h-11 shrink-0 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition text-gray-600"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
