"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardData } from "@/lib/data";
import {
  complaintTopics, freshness, inRange, insights, type Kpis, kpis, MIN_NEGATIVE_FOR_INSIGHTS, type Preset,
  PRESETS, presetRange, type PropertyRow, propertyRows, sydneyToday, topicLabel, weeklyAverages, weeklySentiment,
} from "@/lib/metrics";
import { ComplaintChart, WeeklyRatingChart, WeeklySentimentChart } from "./Charts";
import ReviewFeed, { type FeedFilters } from "./ReviewFeed";
import { ChangeText, Empty, PROPERTY_COLOURS, RatingBadge, Section } from "./ui";

const PERIOD_WORDS: Record<Preset, string> = {
  this_week: "this week", last_week: "last week", "30d": "in the last 30 days", "90d": "in the last 90 days", all: "of all time",
};

function KpiCard({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-base font-semibold text-gray-700">{label}</p>
      <div className="mt-2 text-4xl font-bold">{children}</div>
      {note && <p className="mt-2 text-base text-gray-600">{note}</p>}
    </div>
  );
}

function KpiCards({ k }: { k: Kpis }) {
  return (
    <div>
      {k.isFallback && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
          No reviews have come in yet this week, so these cards show <strong>the last 30 days</strong> instead.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label={`Average rating ${k.periodLabel}`}><RatingBadge score={k.avg} large /></KpiCard>
        <KpiCard label={`Change vs ${k.previousLabel}`}>
          <span className="text-2xl"><ChangeText change={k.change} /></span>
        </KpiCard>
        <KpiCard label={`Reviews ${k.periodLabel}`}>{k.count}</KpiCard>
        <KpiCard label="Negative reviews" note={`${k.negativeCount} of ${k.count} scored below 6`}>{k.count ? `${k.pctNegative}%` : "–"}</KpiCard>
        <KpiCard label="Needs attention" note="Reviews scored 5 or lower">
          <span className={k.needsAttention > 0 ? "text-red-800" : ""}>{k.needsAttention}</span>
        </KpiCard>
      </div>
    </div>
  );
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const th = "px-3 py-2 text-left text-base font-semibold text-gray-700";
  const td = "px-3 py-3 align-middle";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-gray-300">
            {["Property", "This week", "Last week", "Change", "Total reviews", "All-time average", "Top complaint"].map((h) => (
              <th key={h} className={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-200">
              <td className={`${td} font-bold`}>{r.name}</td>
              <td className={td}><RatingBadge score={r.thisWeek} /></td>
              <td className={td}><RatingBadge score={r.lastWeek} /></td>
              <td className={`${td} text-base`}><ChangeText change={r.change} /></td>
              <td className={td}>{r.total}</td>
              <td className={td}><RatingBadge score={r.allTime} /></td>
              <td className={td}>
                {r.topComplaint ? `${topicLabel(r.topComplaint.topic)} (${r.topComplaint.count} negative reviews)` : "None found"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Footer({ data }: { data: DashboardData }) {
  const { lastSuccess } = freshness(data.runs);
  const when = lastSuccess
    ? new Date(lastSuccess).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" })
    : null;
  return (
    <footer className="pb-10 text-center text-base text-gray-600">
      {when ? `Data last updated ${when} (Sydney time)` : "Data last updated: not recorded yet"}
      {data.source === "sample_file" && " · Showing the exported sample file because the database is not connected"}
      <br />Reviews are public guest reviews from Booking.com. Topics are detected automatically by keyword and can be wrong.
    </footer>
  );
}

export default function Dashboard(data: DashboardData) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const preset = (PRESETS.find((p) => p.id === params.get("period"))?.id ?? "30d") as Preset;
  const propertyId = data.properties.some((p) => p.id === params.get("property")) ? params.get("property") : null;
  const feedFilters: FeedFilters = {
    sentiment: params.get("sentiment") ?? "", topic: params.get("topic") ?? "",
    q: params.get("q") ?? "", sort: params.get("sort") ?? "",
  };

  const today = sydneyToday();
  const colours = Object.fromEntries(data.properties.map((p, i) => [p.id, PROPERTY_COLOURS[i % PROPERTY_COLOURS.length]]));
  const properties = propertyId ? data.properties.filter((p) => p.id === propertyId) : data.properties;
  const reviews = propertyId ? data.reviews.filter((r) => r.property_id === propertyId) : data.reviews;
  const periodReviews = inRange(reviews, presetRange(preset, today));
  const complaints = complaintTopics(periodReviews);
  const { warning } = freshness(data.runs);
  const select = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg";

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {warning && <p role="alert" className="rounded-lg bg-red-700 p-4 text-xl font-bold text-white">⚠ {warning}</p>}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Guest Review Dashboard</h1>
          <p className="text-gray-700">What Booking.com guests are saying about our Sydney hotels</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-base">Time period
            <select className={select} value={preset} onChange={(e) => setParam("period", e.target.value)}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-base">Property
            <select className={select} value={propertyId ?? ""} onChange={(e) => setParam("property", e.target.value)}>
              <option value="">All properties</option>
              {data.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      {data.reviews.length === 0 ? (
        <Empty>No reviews have been collected yet. Once the first update has run they will appear here.</Empty>
      ) : (
        <>
          <KpiCards k={kpis(reviews, today)} />

          <Section title="How each property is doing" hint="Weeks run Monday to Sunday, Sydney time. “This week” is the week so far.">
            <PropertyTable rows={propertyRows(reviews, properties, today)} />
          </Section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title="Average rating each week" hint="Last 12 weeks, out of 10. A dot is one week with reviews; weeks with no reviews are skipped.">
              <WeeklyRatingChart rows={weeklyAverages(reviews, properties, today)} properties={properties} colours={colours} />
            </Section>
            <Section title="Number of reviews each week" hint="Last 12 weeks, split into positive, neutral and negative.">
              <WeeklySentimentChart rows={weeklySentiment(reviews, today)} />
            </Section>
          </div>

          <Section
            title="What guests complain about"
            hint={`Topics mentioned in the ${complaints.negativeCount} negative review${complaints.negativeCount === 1 ? "" : "s"} (scored below 6) ${PERIOD_WORDS[preset]}. One review can mention several topics.`}
          >
            {complaints.negativeCount < MIN_NEGATIVE_FOR_INSIGHTS ? (
              <Empty>Not enough reviews to judge. Choose a longer time period at the top of the page.</Empty>
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <ComplaintChart complaints={complaints} />
                <ul className="space-y-3">
                  {insights(periodReviews, PERIOD_WORDS[preset]).map((s) => (
                    <li key={s} className="rounded-lg bg-gray-50 p-4 text-xl">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Guest reviews" hint={`${periodReviews.length} review${periodReviews.length === 1 ? "" : "s"} ${PERIOD_WORDS[preset]}.`}>
            <ReviewFeed reviews={periodReviews} properties={data.properties} filters={feedFilters} onFilter={setParam} />
          </Section>
        </>
      )}

      <Footer data={data} />
    </main>
  );
}
