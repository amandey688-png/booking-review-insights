import { describe, expect, it } from "vitest";
import {
  type Review, average, change, complaintTopics, freshness, insights, kpis, presetRange,
  ratingColour, sydneyToday, weekStart, weeklySentiment,
} from "./metrics";

const review = (date: string, score: number, negative: string[] = [], property = "a"): Review => ({
  review_key: `${date}-${score}-${Math.random()}`, property_id: property, score, title: null,
  liked_text: null, disliked_text: null, traveller_type: null, room_type: null,
  review_date: date, positive_topics: [], negative_topics: negative,
});

describe("week boundaries", () => {
  it("uses the Sydney date, not UTC", () => {
    // 14:30 UTC on Sunday is already 01:30 Monday in Sydney (UTC+11 in summer)
    expect(sydneyToday(new Date("2026-11-22T14:30:00Z"))).toBe("2026-11-23");
  });
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-11-25")).toBe("2026-11-23"); // Wednesday
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday
  });
  it("builds preset ranges", () => {
    expect(presetRange("this_week", "2026-11-25")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(presetRange("last_week", "2026-11-25")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(presetRange("30d", "2026-11-25").from).toBe("2026-10-27");
    expect(presetRange("all", "2026-11-25").from).toBeNull();
  });
});

describe("scores", () => {
  it("averages and handles no reviews", () => {
    expect(average([review("2026-11-24", 8), review("2026-11-24", 5)])).toBe(6.5);
    expect(average([])).toBeNull();
  });
  it("calculates change in points and percent", () => {
    expect(change(6, 8)).toEqual({ diff: -2, pct: -25, direction: "down" });
    expect(change(7, null)).toBeNull();
  });
  it("colours ratings green / amber / red", () => {
    expect([8, 7.9, 6, 5.9, null].map(ratingColour)).toEqual(["green", "amber", "amber", "red", "none"]);
  });
});

describe("kpis", () => {
  const today = "2026-11-25";
  it("summarises this week against last week", () => {
    const k = kpis([review("2026-11-24", 9), review("2026-11-23", 5), review("2026-11-18", 8)], today);
    expect(k).toMatchObject({ isFallback: false, avg: 7, count: 2, negativeCount: 1, pctNegative: 50, needsAttention: 1 });
    expect(k.change?.diff).toBe(-1);
  });
  it("falls back to the last 30 days when this week is empty", () => {
    const k = kpis([review("2026-11-10", 4)], today);
    expect(k).toMatchObject({ isFallback: true, periodLabel: "the last 30 days", count: 1 });
  });
});

describe("complaints and insights", () => {
  const reviews = [
    review("2026-11-24", 3, ["cleanliness", "noise"]),
    review("2026-11-24", 4, ["cleanliness"]),
    review("2026-11-24", 5, []),
    review("2026-11-24", 9, ["wifi"]), // not a negative review - ignored
  ];
  it("counts topics only in negative reviews", () => {
    expect(complaintTopics(reviews)).toEqual({
      negativeCount: 3,
      topics: [{ topic: "cleanliness", count: 2, pct: 67 }, { topic: "noise", count: 1, pct: 33 }],
    });
  });
  it("writes sentences with counts", () => {
    expect(insights(reviews, "this week")[0]).toBe("67% of negative reviews this week mentioned cleanliness (2 of 3)");
  });
  it("refuses to judge fewer than 3 negative reviews", () => {
    expect(insights(reviews.slice(0, 2), "this week")).toEqual(["Not enough reviews to judge"]);
  });
});

describe("weekly sentiment", () => {
  it("buckets reviews into Monday-Sunday weeks", () => {
    const rows = weeklySentiment([review("2026-11-22", 9), review("2026-11-23", 3), review("2026-11-25", 7)], "2026-11-25", 2);
    expect(rows.map((r) => [r.week, r.positive, r.neutral, r.negative])).toEqual([
      ["2026-11-16", 1, 0, 0],
      ["2026-11-23", 0, 1, 1],
    ]);
  });
});

describe("freshness", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const run = (finished: string, status: string) => ({ started_at: finished, finished_at: finished, status });
  it("is quiet when the last run is recent and ok", () => {
    expect(freshness([run("2026-11-25T02:00:00Z", "ok")], now).warning).toBeNull();
  });
  it("warns when stale or failed", () => {
    expect(freshness([run("2026-11-22T02:00:00Z", "ok")], now).warning).toMatch(/48 hours/);
    expect(freshness([run("2026-11-25T02:00:00Z", "failed"), run("2026-11-24T02:00:00Z", "ok")], now).warning).toMatch(/failed/);
  });
});
