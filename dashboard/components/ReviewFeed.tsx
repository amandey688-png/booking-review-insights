"use client";

import { useState } from "react";
import {
  type Property, type Review, type Sentiment, sentimentOf, shortDate, TOPIC_LABELS, topicLabel,
} from "@/lib/metrics";
import { Empty, RatingBadge } from "./ui";

const PAGE_SIZE = 20;
type Sort = "newest" | "lowest";
export type FeedFilters = { sentiment: string; topic: string; q: string; sort: string };

function matches(r: Review, f: FeedFilters): boolean {
  if (f.sentiment && sentimentOf(r.score) !== (f.sentiment as Sentiment)) return false;
  if (f.topic && !r.positive_topics.includes(f.topic) && !r.negative_topics.includes(f.topic)) return false;
  if (!f.q) return true;
  const text = `${r.title ?? ""} ${r.liked_text ?? ""} ${r.disliked_text ?? ""}`.toLowerCase();
  return text.includes(f.q.toLowerCase());
}

function sortReviews(reviews: Review[], sort: Sort): Review[] {
  const byNewest = (a: Review, b: Review) => b.review_date.localeCompare(a.review_date);
  return [...reviews].sort(sort === "lowest" ? (a, b) => a.score - b.score || byNewest(a, b) : byNewest);
}

function Chip({ topic, tone }: { topic: string; tone: "good" | "bad" }) {
  const style = tone === "good" ? "bg-green-50 text-green-900 border-green-200" : "bg-red-50 text-red-900 border-red-200";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-sm ${style}`}>
      {tone === "good" ? "👍" : "👎"} {topicLabel(topic)}
    </span>
  );
}

function ReviewCard({ review, propertyName }: { review: Review; propertyName: string }) {
  return (
    <article className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold">{propertyName}</span>
          <span className="text-gray-600"> · {shortDate(review.review_date)} {review.review_date.slice(0, 4)}</span>
        </div>
        <RatingBadge score={review.score} />
      </div>
      {review.title && <h3 className="mt-2 text-xl font-semibold">{review.title}</h3>}
      {review.liked_text && (
        <p className="mt-2 border-l-4 border-green-600 bg-green-50 px-3 py-2">
          <span className="font-semibold text-green-900">Liked: </span>{review.liked_text}
        </p>
      )}
      {review.disliked_text && (
        <p className="mt-2 border-l-4 border-red-600 bg-red-50 px-3 py-2">
          <span className="font-semibold text-red-900">Disliked: </span>{review.disliked_text}
        </p>
      )}
      {!review.liked_text && !review.disliked_text && <p className="mt-2 text-gray-600">The guest left a score without comments.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {review.negative_topics.map((t) => <Chip key={`n-${t}`} topic={t} tone="bad" />)}
        {review.positive_topics.map((t) => <Chip key={`p-${t}`} topic={t} tone="good" />)}
        <span className="text-sm text-gray-600">
          {[review.traveller_type, review.room_type].filter(Boolean).join(" · ")}
        </span>
      </div>
    </article>
  );
}

const SELECT = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-base";

export default function ReviewFeed({
  reviews, properties, filters, onFilter,
}: {
  reviews: Review[];
  properties: Property[];
  filters: FeedFilters;
  onFilter: (key: keyof FeedFilters, value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const names = new Map(properties.map((p) => [p.id, p.name]));
  const shown = sortReviews(reviews.filter((r) => matches(r, filters)), filters.sort === "lowest" ? "lowest" : "newest");
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const set = (key: keyof FeedFilters, value: string) => { setPage(1); onFilter(key, value); };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-base">Show
          <select className={SELECT} value={filters.sentiment} onChange={(e) => set("sentiment", e.target.value)}>
            <option value="">All reviews</option>
            <option value="negative">Negative (below 6)</option>
            <option value="neutral">Neutral (6 to 7.9)</option>
            <option value="positive">Positive (8 and above)</option>
          </select>
        </label>
        <label className="flex flex-col text-base">Topic
          <select className={SELECT} value={filters.topic} onChange={(e) => set("topic", e.target.value)}>
            <option value="">Any topic</option>
            {Object.entries(TOPIC_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-base">Sort by
          <select className={SELECT} value={filters.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="">Newest first</option>
            <option value="lowest">Lowest score first</option>
          </select>
        </label>
        <label className="flex grow flex-col text-base">Search for a word
          <input type="search" className={SELECT} placeholder="e.g. shower" value={filters.q} onChange={(e) => set("q", e.target.value)} />
        </label>
      </div>

      <p className="mt-4 text-base text-gray-700" aria-live="polite">
        {shown.length} review{shown.length === 1 ? "" : "s"} found
      </p>
      {shown.length === 0 ? (
        <Empty>No reviews match. Try a longer date range or clear the filters above.</Empty>
      ) : (
        <div className="mt-2 space-y-3">
          {shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((r) => (
            <ReviewCard key={r.review_key} review={r} propertyName={names.get(r.property_id) ?? r.property_id} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button className={`${SELECT} disabled:opacity-40`} disabled={current === 1} onClick={() => setPage(current - 1)}>← Previous</button>
          <span>Page {current} of {pages}</span>
          <button className={`${SELECT} disabled:opacity-40`} disabled={current === pages} onClick={() => setPage(current + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
