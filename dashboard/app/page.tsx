import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";
import { loadDashboardData } from "@/lib/data";

export const revalidate = 300; // refresh the data at most every 5 minutes

export default async function Page() {
  try {
    const data = await loadDashboardData();
    return (
      <Suspense fallback={<p className="p-10 text-xl">Loading reviews…</p>}>
        <Dashboard {...data} />
      </Suspense>
    );
  } catch (e) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="text-3xl font-bold">We couldn&apos;t load the reviews</h1>
        <p className="mt-4">Please try again in a few minutes. If this keeps happening, pass this message to your IT contact:</p>
        <pre className="mt-4 whitespace-pre-wrap rounded bg-white p-4 text-base">{e instanceof Error ? e.message : String(e)}</pre>
      </main>
    );
  }
}
