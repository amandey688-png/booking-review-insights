-- Booking.com Review Insights - database schema (Supabase / Postgres)
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run.

create table if not exists properties (
  id            text primary key,          -- short slug, e.g. 'paddington'
  name          text not null,
  booking_slug  text not null unique,      -- Booking.com pagename, e.g. 'olympic-paddington'
  country_code  text not null default 'au',
  url           text not null
);

create table if not exists reviews (
  review_key      text primary key,        -- Booking review id, or sha256 fallback (dedup key)
  property_id     text not null references properties(id),
  score           numeric(3,1),            -- 1.0 - 10.0
  title           text,
  liked_text      text,                    -- "Liked" section
  disliked_text   text,                    -- "Disliked" section
  reviewer_name   text,                    -- first name only, as shown publicly
  reviewer_country text,
  traveller_type  text,                    -- Couple / Family / Solo traveller ...
  room_type       text,
  nights          int,
  stay_month      text,                    -- e.g. 'November 2026'
  review_date     date not null,
  language        text,
  sentiment       text,                    -- positive / neutral / negative (derived)
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);
create index if not exists reviews_property_date_idx on reviews (property_id, review_date desc);
create index if not exists reviews_date_idx on reviews (review_date desc);

create table if not exists review_topics (
  review_key  text references reviews(review_key) on delete cascade,
  topic       text not null,               -- cleanliness, check_in, staff, noise, ...
  polarity    text not null,               -- positive / negative (which section mentioned it)
  primary key (review_key, topic, polarity)
);

create table if not exists scrape_runs (
  id            bigserial primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  property_id   text references properties(id),
  status        text not null default 'running',  -- running / ok / partial / failed
  pages_fetched int default 0,
  reviews_seen  int default 0,
  reviews_new   int default 0,
  error         text
);

-- Seed the four properties
insert into properties (id, name, booking_slug, url) values
 ('paddington',      'Olympic Hotel Paddington', 'olympic-paddington',        'https://www.booking.com/hotel/au/olympic-paddington.html'),
 ('potts_point',     'Potts Point',              'venus-potts-point-sydney',  'https://www.booking.com/hotel/au/venus-potts-point-sydney.html'),
 ('central_sydney',  'Central Sydney',           'venus-surry-hills',         'https://www.booking.com/hotel/au/venus-surry-hills.html'),
 ('darling_harbour', 'Darling Harbour',          'chateau-de-venus',          'https://www.booking.com/hotel/au/chateau-de-venus.html')
on conflict (id) do nothing;

-- Row Level Security: dashboard (anon key) can only READ. Scraper uses service_role key (bypasses RLS).
alter table properties    enable row level security;
alter table reviews       enable row level security;
alter table review_topics enable row level security;
alter table scrape_runs   enable row level security;

create policy "public read properties"    on properties    for select using (true);
create policy "public read reviews"       on reviews       for select using (true);
create policy "public read review_topics" on review_topics for select using (true);
create policy "public read scrape_runs"   on scrape_runs   for select using (true);
