-- 003: one row per review with its topics, for the dashboard (read-only, anon key).
create or replace view reviews_with_topics
with (security_invoker = true) as        -- respects the read-only RLS policies on the tables
select
  r.*,
  coalesce(array_agg(t.topic order by t.topic) filter (where t.polarity = 'positive'), '{}') as positive_topics,
  coalesce(array_agg(t.topic order by t.topic) filter (where t.polarity = 'negative'), '{}') as negative_topics
from reviews r
left join review_topics t using (review_key)
group by r.review_key;

grant select on reviews_with_topics to anon, authenticated;
