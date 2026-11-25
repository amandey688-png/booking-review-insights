// Server-side data loading. Read-only: uses the publishable (anon) key, protected by RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Property, Review, ScrapeRun } from "./metrics";

export type DashboardData = {
  reviews: Review[];
  properties: Property[];
  runs: ScrapeRun[];
  source: "supabase" | "sample_file";
};

// Same four properties as scraper/config.py - only used for the sample-file fallback.
const SAMPLE_PROPERTIES: Property[] = [
  { id: "paddington", name: "Olympic Hotel Paddington" },
  { id: "potts_point", name: "Potts Point" },
  { id: "central_sydney", name: "Central Sydney" },
  { id: "darling_harbour", name: "Darling Harbour" },
];

const REVIEW_COLUMNS =
  "review_key,property_id,score,title,liked_text,disliked_text,traveller_type,room_type,review_date,positive_topics,negative_topics";

async function fetchAllReviews(db: SupabaseClient): Promise<Review[]> {
  const rows: Review[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("reviews_with_topics")
      .select(REVIEW_COLUMNS)
      .order("review_key")
      .range(from, from + 999);
    if (error) throw new Error(`Could not load reviews: ${error.message}`);
    rows.push(...(data as Review[]));
    if (data.length < 1000) return rows;
  }
}

async function loadFromSupabase(url: string, key: string): Promise<DashboardData> {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const [reviews, properties, runs] = await Promise.all([
    fetchAllReviews(db),
    db.from("properties").select("id,name").order("name"),
    db.from("scrape_runs").select("started_at,finished_at,status").order("started_at", { ascending: false }).limit(50),
  ]);
  if (properties.error) throw new Error(`Could not load properties: ${properties.error.message}`);
  if (runs.error) throw new Error(`Could not load update history: ${runs.error.message}`);
  return { reviews, properties: properties.data, runs: runs.data, source: "supabase" };
}

/** Local fallback so the dashboard can be tried without a database: the scraper's exported file. */
async function loadFromSampleFile(): Promise<DashboardData> {
  const file = path.join(process.cwd(), "..", "data", "sample_reviews.json");
  const reviews = JSON.parse(await readFile(file, "utf-8")) as Review[];
  return { reviews, properties: SAMPLE_PROPERTIES, runs: [], source: "sample_file" };
}

export async function loadDashboardData(): Promise<DashboardData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? loadFromSupabase(url, key) : loadFromSampleFile();
}
