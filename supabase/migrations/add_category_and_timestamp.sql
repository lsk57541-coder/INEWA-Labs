-- Run this in Supabase SQL Editor before deploying the bulk location registration feature

ALTER TABLE locations ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE videos ADD COLUMN IF NOT EXISTS timestamp_sec integer;
