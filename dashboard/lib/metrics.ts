// All dashboard calculations live here: week boundaries, averages, change, insight sentences.
// Dates are plain "YYYY-MM-DD" strings in Sydney time, so no time-of-day maths is needed.

export type Review = {
  review_key: string;
  property_id: string;
  score: number;
  title: string | null;
  liked_text: string | null;
  disliked_text: string | null;
  traveller_type: string | null;
  room_type: string | null;
  review_date: string;
  positive_topics: string[];
  negative_topics: string[];
};
export type Property = { id: string; name: string };
export type Sentiment = "positive" | "neutral" | "negative";
export type Preset = "this_week" | "last_week" | "30d" | "90d" | "all";
export type Range = { from: string | null; to: string };

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

export const TOPIC_LABELS: Record<string, string> = {
  cleanliness: "Cleanliness",
  check_in: "Check-in",
  staff: "Staff",
  noise: "Noise",
  facilities: "Facilities",
  location: "Location",
  room_condition: "Room condition",
  value_for_money: "Value for money",
  aircon_heating: "Air-con / heating",
  wifi: "Wi-Fi",
};
export const topicLabel = (t: string): string => TOPIC_LABELS[t] ?? t;

export const NEGATIVE_BELOW = 6; // score < 6 is a negative review
export const NEEDS_ATTENTION_AT = 5; // score <= 5 needs a manager to look at it

// ---------- dates ----------

/** Today's date in Sydney, e.g. "2026-11-25". */
export function sydneyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` (weeks run Monday-Sunday). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

export function presetRange(preset: Preset, today: string): Range {
  const monday = weekStart(today);
  switch (preset) {
    case "this_week":
      return { from: monday, to: addDays(monday, 6) };
    case "last_week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "all":
      return { from: null, to: today };
  }
}

export function inRange(reviews: Review[], range: Range): Review[] {
  return reviews.filter(
    (r) => (range.from === null || r.review_date >= range.from) && r.review_date <= range.to,
  );
}

/** "24 Nov" style label for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// ---------- scores ----------

export function sentimentOf(score: number): Sentiment {
  if (score >= 8) return "positive";
  return score >= NEGATIVE_BELOW ? "neutral" : "negative";
}

export type RatingColour = "green" | "amber" | "red" | "none";
export function ratingColour(score: number | null): RatingColour {
  if (score === null) return "none";
  if (score >= 8) return "green";
  return score >= 6 ? "amber" : "red";
}

export function average(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
}

export function formatRating(score: number | null): string {
  return score === null ? "No reviews" : `${score.toFixed(1)} / 10`;
}

export type Change = { diff: number; pct: number; direction: "up" | "down" | "same" };
/** Change between two averages, in rating points and in percent. Null when either side is missing. */
export function change(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null || previous === 0) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  return { diff, pct: Math.round(((current - previous) / previous) * 100), direction };
}

export const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

// ---------- KPI cards ----------

export type Kpis = {
  periodLabel: string; // "this week" or "the last 30 days"
  previousLabel: string;
  isFallback: boolean; // true when this week had no reviews
  avg: number | null;
  change: Change | null;
  count: number;
  negativeCount: number;
  pctNegative: number;
  needsAttention: number;
};

export function kpis(reviews: Review[], today: string): Kpis {
  const thisWeek = inRange(reviews, presetRange("this_week", today));
  const isFallback = thisWeek.length === 0;
  const current = isFallback ? inRange(reviews, presetRange("30d", today)) : thisWeek;
  const previous = isFallback
    ? inRange(reviews, { from: addDays(today, -59), to: addDays(today, -30) })
    : inRange(reviews, presetRange("last_week", today));
  const negativeCount = current.filter((r) => r.score < NEGATIVE_BELOW).length;
  return {
    periodLabel: isFallback ? "the last 30 days" : "this week",
    previousLabel: isFallback ? "the 30 days before" : "last week",
    isFallback,
    avg: average(current),
    change: change(average(current), average(previous)),
    count: current.length,
    negativeCount,
    pctNegative: percent(negativeCount, current.length),
    needsAttention: current.filter((r) => r.score <= NEEDS_ATTENTION_AT).length,
  };
}

// ---------- complaint topics ----------

export type TopicCount = { topic: string; count: number; pct: number };
export type Complaints = { negativeCount: number; topics: TopicCount[] };

/** How often each topic is complained about in negative reviews (score < 6). */
export function complaintTopics(reviews: Review[]): Complaints {
  const negative = reviews.filter((r) => r.score < NEGATIVE_BELOW);
  const counts = new Map<string, number>();
  for (const r of negative)
    for (const t of r.negative_topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topics = [...counts.entries()]
    .map(([topic, count]) => ({ topic, count, pct: percent(count, negative.length) }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  return { negativeCount: negative.length, topics };
}

export const MIN_NEGATIVE_FOR_INSIGHTS = 3;

/** Up to 3 plain-English sentences, always with counts. `period` reads like "this week". */
export function insights(reviews: Review[], period: string): string[] {
  const { negativeCount, topics } = complaintTopics(reviews);
  if (negativeCount < MIN_NEGATIVE_FOR_INSIGHTS) return ["Not enough reviews to judge"];
  if (topics.length === 0)
    return [`None of the ${negativeCount} negative reviews ${period} mentioned a topic we track.`];
  return topics
    .slice(0, 3)
    .map(
      (t) =>
        `${t.pct}% of negative reviews ${period} mentioned ${topicLabel(t.topic).toLowerCase()} (${t.count} of ${negativeCount})`,
    );
}

// ---------- property table ----------

export type PropertyRow = {
  id: string;
  name: string;
  thisWeek: number | null;
  lastWeek: number | null;
  change: Change | null;
  total: number;
  allTime: number | null;
  topComplaint: TopicCount | null;
};

export function propertyRows(reviews: Review[], properties: Property[], today: string): PropertyRow[] {
  return properties.map((p) => {
    const own = reviews.filter((r) => r.property_id === p.id);
    const thisWeek = average(inRange(own, presetRange("this_week", today)));
    const lastWeek = average(inRange(own, presetRange("last_week", today)));
    return {
      id: p.id,
      name: p.name,
      thisWeek,
      lastWeek,
      change: change(thisWeek, lastWeek),
      total: own.length,
      allTime: average(own),
      topComplaint: complaintTopics(own).topics[0] ?? null,
    };
  });
}

// ---------- weekly charts ----------

/** Mondays of the last `weeks` weeks, oldest first, ending with the current week. */
export function lastWeeks(today: string, weeks = 12): string[] {
  const monday = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => addDays(monday, -7 * (weeks - 1 - i)));
}

export type WeeklyAverageRow = { week: string; label: string } & Record<string, number | string | null>;

/** One row per week; one column per property id holding that week's average (null = no reviews). */
export function weeklyAverages(
  reviews: Review[],
  properties: Property[],
  today: string,
  weeks = 12,
): WeeklyAverageRow[] {
  return lastWeeks(today, weeks).map((week) => {
    const row: WeeklyAverageRow = { week, label: shortDate(week) };
    const inWeek = inRange(reviews, { from: week, to: addDays(week, 6) });
    for (const p of properties) {
      const avg = average(inWeek.filter((r) => r.property_id === p.id));
      row[p.id] = avg === null ? null : Math.round(avg * 10) / 10;
    }
    return row;
  });
}

export type WeeklySentimentRow = { week: string; label: string } & Record<Sentiment, number>;

export function weeklySentiment(reviews: Review[], today: string, weeks = 12): WeeklySentimentRow[] {
  return lastWeeks(today, weeks).map((week) => {
    const row: WeeklySentimentRow = { week, label: shortDate(week), positive: 0, neutral: 0, negative: 0 };
    for (const r of inRange(reviews, { from: week, to: addDays(week, 6) })) row[sentimentOf(r.score)] += 1;
    return row;
  });
}

// ---------- data freshness ----------

export type ScrapeRun = { started_at: string; finished_at: string | null; status: string };
export type Freshness = { lastSuccess: string | null; warning: string | null };

export const STALE_AFTER_HOURS = 48;

export function freshness(runs: ScrapeRun[], now: Date = new Date()): Freshness {
  const sorted = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const lastOk = sorted.find((r) => r.status === "ok" && r.finished_at);
  const lastSuccess = lastOk?.finished_at ?? null;
  if (sorted.length === 0) return { lastSuccess, warning: null };
  if (sorted[0].status === "failed")
    return { lastSuccess, warning: "The latest review update failed. The numbers below may be out of date." };
  const ageHours = lastSuccess ? (now.getTime() - new Date(lastSuccess).getTime()) / 36e5 : Infinity;
  if (ageHours > STALE_AFTER_HOURS)
    return { lastSuccess, warning: "Reviews have not been updated for more than 48 hours. The numbers below may be out of date." };
  return { lastSuccess, warning: null };
}
