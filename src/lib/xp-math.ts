/*
  Pure XP/level math — ported from the official DQR Wiki XP calculator.
  Formula: xpForLevel(L) = Math.round(84 * Math.pow(1.13, L - 1)).
  Range totals sum each rounded level; VIP, solo, XP boost, and event stack
  additively, then hardcore's +25% multiplies that total (max 4.125x).
*/

import { isBossRaidSlug } from "./xp-dungeons";

/** Highest reachable level. From caps at MAX_LEVEL - 1, To at MAX_LEVEL. */
export const MAX_LEVEL = 300;
export const MIN_LEVEL = 1;

/** Single-level cost — the official golden values pin this down. */
export function xpForLevel(level: number): number {
  return Math.round(84 * Math.pow(1.13, level - 1));
}

/** Sum of each rounded level from `from` (inclusive) to `to` (exclusive). */
export function totalXp(fromLevel: number, toLevel: number): number {
  if (!Number.isFinite(fromLevel) || !Number.isFinite(toLevel) || toLevel <= fromLevel) return 0;
  let total = 0;
  for (let level = fromLevel; level < toLevel; level += 1) total += xpForLevel(level);
  return total;
}

/** XP still needed after current progress — never negative. */
export function remainingXp(fromLevel: number, toLevel: number, currentXp: number): number {
  return Math.max(0, totalXp(fromLevel, toLevel) - currentXp);
}

export interface BoostInput {
  readonly vip?: boolean | undefined;
  readonly solo?: boolean | undefined;
  readonly hardcore?: boolean | undefined;
  readonly xpBoost?: boolean | undefined;
  /** Event boost: 0 (none), 0.5 (1.5x), or 1 (2x). */
  readonly eventBoost?: number | undefined;
}

/**
  Additive base: 1 + .2 VIP + .1 solo + 1 boost + event.
  Hardcore's +25% is multiplicative on that base, unlike the other boosts.
*/
export function boostMultiplier(input: BoostInput): number {
  const additive =
    1 +
    0.2 * Number(input.vip === true) +
    0.1 * Number(input.solo === true) +
    Number(input.xpBoost === true) +
    (input.eventBoost ?? 0);
  return additive * (input.hardcore === true ? 1.25 : 1);
}

/** Boosted XP per run. */
export function boostedXpPerRun(baseXp: number, multiplier: number): number {
  return baseXp * multiplier;
}

/** Whole runs to cover the remainder — rounds up, like the official. */
export function runsNeeded(remaining: number, perRun: number): number {
  if (!(perRun > 0) || !(remaining > 0)) return 0;
  return Math.ceil(remaining / perRun);
}

/** Rounded total minutes for the run count at this pace. */
export function estimateMinutes(runs: number, minutesPerRun: number): number {
  return Math.round(runs * minutesPerRun);
}

/** Official duration display: days drop minutes, hours keep them. */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes >= 1440) return `${Math.floor(totalMinutes / 1440)}d ${Math.floor((totalMinutes % 1440) / 60)}h`;
  if (totalMinutes >= 60) return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  return `${totalMinutes}m`;
}

const COMPACT_STEPS: ReadonlyArray<readonly [number, string]> = [
  [1e15, "Q"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/** Nearest K/M/B/T/Q unit, one decimal — the official compact formatter. */
function compactUnit(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return value.toLocaleString("en-GB");
  const round1 = (n: number): number => Math.round(n * 10) / 10;
  let index = COMPACT_STEPS.findIndex(([scale]) => abs >= scale);
  if (index < 0) index = COMPACT_STEPS.length - 1;
  while (index > 0) {
    const step = COMPACT_STEPS[index];
    if (step === undefined || Math.abs(round1(value / step[0])) < 1000) break;
    index -= 1;
  }
  const step = COMPACT_STEPS[index] ?? COMPACT_STEPS[COMPACT_STEPS.length - 1];
  if (step === undefined) return value.toLocaleString("en-GB");
  const rounded = round1(value / step[0]);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${step[1]}`;
}

/** Official full formatter: locale string, compact past 1e9, scientific past 1e18. */
export function formatFull(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e18) return value.toLocaleString("en-GB", { maximumFractionDigits: 2, notation: "scientific" });
  if (Math.abs(value) >= 1e9) return compactUnit(value);
  return value.toLocaleString("en-GB");
}

/** Official short formatter: ~K/M/B/T/Q, full form otherwise. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e18) return formatFull(value);
  for (const [size, suffix] of COMPACT_STEPS) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      return `${scaled.toLocaleString("en-GB", {
        maximumFractionDigits: Math.abs(scaled) >= 100 ? 0 : 2,
        useGrouping: false,
      })}${suffix}`;
    }
  }
  return Math.round(value).toLocaleString("en-GB");
}

/** Game HUD compact format: same units, but truncated instead of rounded. */
export function formatCompactTruncated(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e18) return formatFull(value);
  for (const [size, suffix] of COMPACT_STEPS) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      const decimals = Math.abs(scaled) >= 100 ? 0 : 2;
      const factor = 10 ** decimals;
      const truncated = Math.trunc(scaled * factor) / factor;
      return `${truncated.toLocaleString("en-GB", { maximumFractionDigits: decimals, useGrouping: false })}${suffix}`;
    }
  }
  return Math.round(value).toLocaleString("en-GB");
}

/** Official level parse: digits only, in range; blank falls back (usually the min). */
export function parseLevelInput(value: string, min: number, max: number, fallback = min): number {
  if (value === "") return fallback;
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : Number.NaN;
}

const AMOUNT_SUFFIXES: Readonly<Record<string, number>> = {
  b: 1e9,
  dc: 1e33,
  k: 1e3,
  m: 1e6,
  no: 1e30,
  oc: 1e27,
  q: 1e15,
  qa: 1e15,
  qi: 1e18,
  sp: 1e24,
  sx: 1e21,
  t: 1e12,
};

/**
 * Official amount parse: blank is 0, commas/whitespace/`~`/`x`/`+` tolerated,
 * K/M/B/T/Q-style suffixes scaled. Out of 0..1e33 (or unparseable) is NaN.
 */
export function parseAmountInput(value: string): number {
  if (value.trim() === "") return 0;
  if (value.length > 48) return Number.NaN;
  const compact = value
    .trim()
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^~/, "")
    .replace(/x$/i, "")
    .replace(/\+$/, "");
  const match = /^(-?\d*\.?\d+)([a-z]*)$/i.exec(compact);
  if (!match) return Number.NaN;
  const suffix = (match[2] ?? "").toLowerCase();
  const scale = suffix === "" ? 1 : AMOUNT_SUFFIXES[suffix];
  if (scale === undefined) return Number.NaN;
  const scaled = Number(match[1]) * scale;
  if (!Number.isFinite(scaled)) return Number.NaN;
  const precise = Number(scaled.toPrecision(12));
  return Number.isFinite(precise) && precise >= 0 && precise <= 1e33 ? precise : Number.NaN;
}

export const BOSS_UNLOCK_MESSAGE = "Boss Raids unlock at level 130.";
export const BOSS_CAP_MESSAGE = "Boss Raids only grant level-up XP up to level 145.";

/** Boss Raids only serve levels 130–145; every other dungeon is unrestricted. */
export function bossLevelError(dungeonSlug: string, fromLevel: number, toLevel: number): string | null {
  if (!isBossRaidSlug(dungeonSlug)) return null;
  if (fromLevel < 130) return BOSS_UNLOCK_MESSAGE;
  if (fromLevel >= 145 || toLevel > 145) return BOSS_CAP_MESSAGE;
  return null;
}
