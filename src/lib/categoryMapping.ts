// 카테고리 대분류 매핑 — 원본 category(카카오 로컬 API leaf, open-ended)를 8개 대분류로 축약.
// 정확표가 아니라 "키워드 포함" 휴리스틱: leaf 문자열/수동입력에 키워드가 들어있으면 그 대분류로 판정.
// ★순서 중요: 위에서부터 검사, 먼저 걸리는 대분류로 확정(예: "치킨"은 한식보다 고기·구이가 먼저).
// 매핑 실패/빈값/카테고리 없음(추출 결과)은 '기타'.

export interface MajorCategory {
  key: string
  label: string
  emoji: string
  keywords: string[]
}

// 칩에 노출할 8개 대분류(이 순서 = 검사 순서 = 칩 표시 순서). '기타'는 칩에서 제외.
export const MAJOR_CATEGORIES: MajorCategory[] = [
  { key: 'cafe', label: '카페·디저트', emoji: '☕', keywords: ['카페', '커피', '제과', '베이커리', '디저트', '도넛', '스타벅스', '빽다방', '블루보틀', '이니스프리', '빵'] },
  { key: 'bar', label: '술집·주점', emoji: '🍺', keywords: ['술집', '주점', '호프', '포장마차', '이자카야', '펍'] },
  { key: 'meat', label: '고기·구이', emoji: '🥩', keywords: ['고기', '육류', '삼겹살', '갈비', '곱창', '막창', '치킨', '오리', '장어', '닭'] },
  { key: 'seafood', label: '해산물', emoji: '🐟', keywords: ['해물', '생선', '회', '초밥', '롤', '굴', '전복', '참치', '아구', '수산', '해산물'] },
  { key: 'stay', label: '숙박', emoji: '🏨', keywords: ['호텔', '펜션', '민박', '게스트하우스', '리조트', '콘도', '모텔'] },
  { key: 'tour', label: '관광·자연', emoji: '🏞️', keywords: ['오름', '해수욕장', '해변', '폭포', '숲', '동굴', '바위', '하천', '섬', '봉우리', '항구', '포구', '명소', '관광', '유적', '드라이브', '둘레길', '휴양림', '수목원', '식물원', '농장', '목장', '유원지', '미술관', '전시', '박물관', '테마파크', '아쿠아리움', '공연', '극장', '시장', '공원'] },
  { key: 'world', label: '세계음식·양식', emoji: '🍜', keywords: ['양식', '이탈리안', '피자', '햄버거', '버거', '돈까스', '우동', '일식', '중식', '중국', '베트남', '인도', '퓨전', '분식', '뷔페', '파스타', '스시'] },
  { key: 'korean', label: '한식', emoji: '🍚', keywords: ['한식', '한정식', '국수', '칼국수', '해장국', '국밥', '설렁탕', '감자탕', '순대', '쌈밥', '찌개', '전골', '백반'] },
]

export const ETC_KEY = '기타'

// 원본 category → 대분류 key. 못 맞추거나 빈값/없음이면 '기타'.
export function mapToMajorCategory(category: string | null | undefined): string {
  if (!category || !category.trim()) return ETC_KEY
  for (const cat of MAJOR_CATEGORIES) {
    if (cat.keywords.some((k) => category.includes(k))) return cat.key
  }
  return ETC_KEY
}
