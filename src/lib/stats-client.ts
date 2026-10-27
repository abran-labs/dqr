/*
  Client for the stats sidecar (`server/index.ts`).
  In prod nginx routes /api to the service; in dev astro.config.ts proxies it.
  Set PUBLIC_STATS_API_URL to override (e.g. a full tunnel URL).
*/

import type { AutofillField } from "./autofill-feedback";

export interface StatsSummary {
  readonly itemsCalculated: number;
  readonly levelsCalculated: number;
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
      levelsCalculated: data.levelsCalculated ?? 0,
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

export async function logLevelCalculation(): Promise<number | null> {
  try {
    const response = await fetch(`${BASE}/events`, {
      body: JSON.stringify({ type: "level-calculation" }),
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

export interface VlmTooltipRead {
  readonly name: string | null;
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
  readonly maxPower?: number | null;
  readonly recommended?: "physical" | "spell" | "health" | null;
  readonly rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary" | "ultimate" | null;
  readonly plateBox?: readonly [number, number, number, number] | null;
}

/** Vision-model read of a tooltip image. Null on any failure so callers can fall back to OCR. */
export async function scanWithVlm(imageDataUrl: string): Promise<VlmTooltipRead | null> {
  try {
    const response = await fetch(`${BASE}/scan`, {
      body: JSON.stringify({ image: imageDataUrl }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    return (await response.json()) as VlmTooltipRead;
  } catch {
    return null;
  }
}

export async function submitFeedback(
  calculationId: number,
  field: AutofillField,
  accurate: boolean,
): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/feedback`, {
      body: JSON.stringify({ accurate, calculationId, field }),
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
