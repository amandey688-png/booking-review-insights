import type { ReactNode } from "react";
import { type Change, formatRating, ratingColour, type RatingColour } from "@/lib/metrics";

// Chart colours (validated colour-blind-safe set). Properties keep their colour in every chart.
export const PROPERTY_COLOURS = ["#257de0", "#f47230", "#00b894", "#f2a600"];
export const SENTIMENT_COLOURS = { positive: "#0aac23", neutral: "#fbb315", negative: "#dc3c3d" };

const BADGE: Record<RatingColour, string> = {
  green: "bg-green-100 text-green-900 border-green-300",
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-red-100 text-red-900 border-red-300",
  none: "bg-gray-100 text-gray-600 border-gray-300",
};
const WORD: Record<RatingColour, string> = { green: "Good", amber: "OK", red: "Poor", none: "" };

/** Rating as "6.4 / 10" on green / amber / red, with a word so colour is never the only signal. */
export function RatingBadge({ score, large = false }: { score: number | null; large?: boolean }) {
  const colour = ratingColour(score);
  return (
    <span
      className={`inline-flex items-baseline gap-2 whitespace-nowrap rounded-lg border font-bold ${BADGE[colour]} ${large ? "px-4 py-2 text-4xl" : "px-2.5 py-0.5 text-lg"}`}
    >
      {formatRating(score)}
      {score !== null && <span className={large ? "text-lg font-semibold" : "text-sm font-semibold"}>{WORD[colour]}</span>}
    </span>
  );
}

export function ChangeText({ change, versus }: { change: Change | null; versus?: string }) {
  if (!change) return <span className="text-gray-600">No comparison available</span>;
  const { direction, diff, pct } = change;
  if (direction === "same") return <span className="text-gray-700">→ No change{versus ? ` vs ${versus}` : ""}</span>;
  const up = direction === "up";
  return (
    <span className={`font-semibold ${up ? "text-green-800" : "text-red-800"}`}>
      {up ? "▲ Up" : "▼ Down"} {Math.abs(diff).toFixed(1)} ({up ? "+" : ""}{pct}%){versus ? ` vs ${versus}` : ""}
    </span>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      {hint && <p className="mt-1 text-base text-gray-600">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-6 text-center text-gray-700">{children}</p>;
}
