-- 002: record how many review cards a run had to skip (no usable date or score).
alter table scrape_runs add column if not exists reviews_skipped int default 0;
