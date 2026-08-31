/*
  Client for the stats sidecar (`server/index.ts`).
  In prod nginx routes /api to the service; in dev astro.config.ts proxies it.
  Set PUBLIC_STATS_API_URL to override (e.g. a full tunnel URL).
*/

export interface StatsSummary {
  readonly itemsCalculated: number;
  readonly feedbackTotal: number;
  readonly feedbackAccurate: number;
  readonly accuracy: number | null;
}

const rawBase = import.meta.env.PUBLIC_STATS_API_URL;
const BASE = typeof rawBase === "string" && rawBase.length > 0 ? rawBase : "/api";

export async function fetchStats(): Promise<StatsSummary | null> {
  try {
    const response = await fetch(`${BASE}/stats`);
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<StatsSummary>;
    return {
      accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
      feedbackAccurate: data.feedbackAccurate ?? 0,
      feedbackTotal: data.feedbackTotal ?? 0,
      itemsCalculated: data.itemsCalculated ?? 0,
    };
  } catch {
    return null;
  }
}

export async function logCalculation(scan: {
  readonly imageDataUrl: string | null;
  readonly processedText: string;
  readonly rawText: string;
}): Promise<number | null> {
  try {
    const response = await fetch(`${BASE}/events`, {
      body: JSON.stringify({
        image: scan.imageDataUrl,
        processedText: scan.processedText,
        rawText: scan.rawText,
        type: "calculation",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<{ id: unknown }>;
    return typeof data.id === "number" ? data.id : null;
  } catch {
    return null;
  }
}

export async function submitFeedback(calculationId: number, accurate: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/feedback`, {
      body: JSON.stringify({ calculationId, accurate }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Fired whenever a calculation or feedback lands, so mounted strips refetch. */
export const STATS_UPDATED_EVENT = "dqr:stats-updated";

export function announceStatsUpdate(): void {
  window.dispatchEvent(new Event(STATS_UPDATED_EVENT));
}
