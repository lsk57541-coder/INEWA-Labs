-- 찜/가본곳 "전체 번짐" 버그 수정: 같은 영상(video_id)이 여러 좌표(여러 가게)일 때
-- 장소별로 따로 찜되도록, 유니크 제약을 (user_id, video_id) → (user_id, video_id, lat, lng)로 완화.
-- Supabase SQL Editor(Dashboard > SQL Editor)에서 실행.
--
-- 안전성: 새 제약은 기존보다 "덜 제한적"이라 기존 행(좌표별 1개)은 전부 만족 → 데이터 손실/깨짐 없음.
-- lat/lng 컬럼은 이미 존재. 재실행해도 안전(idempotent): 새 제약을 먼저 drop if exists 후 재생성.
-- 제약명은 인라인 `unique (user_id, video_id)`의 Postgres 기본명을 직접 지정.

-- favorites
alter table favorites drop constraint if exists favorites_user_id_video_id_key;
alter table favorites drop constraint if exists favorites_user_video_place_key;
alter table favorites add constraint favorites_user_video_place_key unique (user_id, video_id, lat, lng);

-- visited_places
alter table visited_places drop constraint if exists visited_places_user_id_video_id_key;
alter table visited_places drop constraint if exists visited_places_user_video_place_key;
alter table visited_places add constraint visited_places_user_video_place_key unique (user_id, video_id, lat, lng);

-- (확인용 — 실행 후 결과에 (user_id, video_id, lat, lng) 복합 unique만 보이면 정상)
-- select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid in ('favorites'::regclass, 'visited_places'::regclass) and contype = 'u';
