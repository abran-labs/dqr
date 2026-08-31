/*
  Pure pot math — formula and tiers per docs/Info/Pot-System.md,
  resolution flow per docs/Info/Item-Data.md.
*/

import { type DqrItem, type ItemRarityRow } from "./dqr-items";

/** Each upgrade adds a flat 10 to the upgraded stat. */
export const UPGRADE_STEP = 10;

export function calculatePotential(currentStat: number, upgradesDone: number, upgradesTotal: number): number {
  return currentStat + Math.max(0, upgradesTotal - upgradesDone) * UPGRADE_STEP;
}

/** Row's pot range — derived unless the row stores explicit legacy potentials. */
export function rowPotRange(row: ItemRarityRow): { minPot: number; maxPot: number } {
  if (row.minPot !== undefined && row.maxPot !== undefined) return { minPot: row.minPot, maxPot: row.maxPot };
  return { minPot: row.minBase + row.minUps * UPGRADE_STEP, maxPot: row.maxBase + row.maxUps * UPGRADE_STEP };
}

/** Percentile of a pot within the row's [min, max], clamped to 0..100. */
export function potentialPercentile(pot: number, row: ItemRarityRow): number {
  const { minPot, maxPot } = rowPotRange(row);
  if (maxPot <= minPot) return pot >= maxPot ? 100 : 0;
  return Math.min(100, Math.max(0, ((pot - minPot) / (maxPot - minPot)) * 100));
}

export type Tier = "reverse-god" | "low" | "average" | "good" | "god";

/** One config object, retunable without touching calculation code. */
export const TIER_INFO: Record<Tier, { label: string; color: string }> = {
  "reverse-god": { label: "Reverse God Pot", color: "#A78BFA" },
  average: { label: "Average Pot", color: "#FACC15" },
  god: { label: "God Pot", color: "#F59E0B" },
  good: { label: "Good Pot", color: "#4ADE80" },
  low: { label: "Low Pot", color: "#F87171" },
};

export function classifyTier(percentile: number): Tier {
  if (percentile <= 1) return "reverse-god";
  if (percentile <= 30) return "low";
  if (percentile < 70) return "average";
  if (percentile < 99) return "good";
  return "god";
}

export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Union ranges across an item's rows — the bounds for manual entry and the
 * OCR sanity check (a read outside these is a misread, docs/Info/Item-Data.md).
 */
export function upsRange(rows: readonly ItemRarityRow[]): NumberRange | null {
  if (rows.length === 0) return null;
  return {
    min: Math.min(...rows.map((row) => row.minUps)),
    max: Math.max(...rows.map((row) => row.maxUps)),
  };
}

/**
 * Current-stat bounds: stat = base + done upgrades × 10, so with `done` known
 * the base range shifts by done × 10; without it, use the widest reachable span.
 */
export function statRange(rows: readonly ItemRarityRow[], done?: number): NumberRange | null {
  if (rows.length === 0) return null;
  const minBase = Math.min(...rows.map((row) => row.minBase));
  const maxBase = Math.max(...rows.map((row) => row.maxBase));
  if (typeof done === "number") return { min: minBase + done * UPGRADE_STEP, max: maxBase + done * UPGRADE_STEP };
  const maxUps = Math.max(...rows.map((row) => row.maxUps));
  return { min: minBase, max: maxBase + maxUps * UPGRADE_STEP };
}

/** Armor health-roll bounds (DPS-armor rows). Null when the track doesn't exist. */
export function healthRange(rows: readonly ItemRarityRow[]): NumberRange | null {
  const withHealth = rows.filter(
    (row) => (row.lowestHealth ?? 0) > 0 && (row.highestHealth ?? 0) > 0,
  );
  if (withHealth.length === 0) return null;
  return {
    min: Math.min(...withHealth.map((row) => row.lowestHealth ?? 0)),
    max: Math.max(...withHealth.map((row) => row.highestHealth ?? 0)),
  };
}

export interface RarityInput {
  readonly upgradesTotal: number;
  readonly pot: number;
  /** Current armor health — the strongest disambiguator when present. */
  readonly health?: number | undefined;
}

/**
 * Keep the rows where upgrades, pot, and (if given) health all fit.
 * 1 survivor -> autofill; >1 -> ask via rarity selector; 0 -> hard error.
 */
export function resolveRarityRows(item: DqrItem, input: RarityInput): ItemRarityRow[] {
  return item.rows.filter((row) => {
    if (input.upgradesTotal < row.minUps || input.upgradesTotal > row.maxUps) return false;
    const { minPot, maxPot } = rowPotRange(row);
    if (input.pot < minPot || input.pot > maxPot) return false;
    if (input.health !== undefined && row.lowestHealth !== undefined && row.highestHealth !== undefined) {
      if (row.highestHealth > row.lowestHealth && (input.health < row.lowestHealth || input.health > row.highestHealth)) {
        return false;
      }
    }
    return true;
  });
}
