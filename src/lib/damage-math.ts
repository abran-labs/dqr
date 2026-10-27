/* Official DQR Wiki damage formula, numeric parsing, and result formatting. */

import type { InnerBuff } from "./damage-types";

/** Inner-buff multipliers: none 1x, inner 1.8x, enhanced 1.9x. */
export const INNER_MULTIPLIERS: Record<InnerBuff, number> = {
  enhanced: 1.9,
  inner: 1.8,
  none: 1,
};

export interface DamageInputs {
  readonly weaponPower: number;
  readonly armorPower: number;
  readonly helmetPower: number;
  readonly skillPoints: number;
  readonly abilityMultiplier: number;
  readonly inner: InnerBuff;
}

export interface DamageResult {
  readonly average: number;
  readonly low: number;
  readonly high: number;
}

/**
 * average = weapon*(.6597+.013202*skill)*((armor+helmet)*.0028)*mult*inner;
 * low is 95% and high is 105% of average.
 */
export function calculateDamage(inputs: DamageInputs): DamageResult {
  const average =
    inputs.weaponPower *
    (0.6597 + 0.013202 * inputs.skillPoints) *
    ((inputs.armorPower + inputs.helmetPower) * 0.0028) *
    inputs.abilityMultiplier *
    INNER_MULTIPLIERS[inputs.inner];
  return { average, high: 1.05 * average, low: 0.95 * average };
}

const SUFFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e15, "Q"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const SUFFIX_SCALE: Readonly<Record<string, number>> = {
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

/** Largest pot the official parser accepts. */
export const MAX_POT = 1e33;

/** Largest skill-point value the official parser accepts. */
export const MAX_SKILL_POINTS = 100_000;

/** Official numeric parser, including compact suffixes and 12-digit precision. */
export function parsePotInput(raw: string): number {
  if (raw.trim() === "") return 0;
  if (raw.length > 48) return Number.NaN;
  const compact = raw.trim().replace(/,/g, "").replace(/\s+/g, "").replace(/^~/, "").replace(/x$/i, "").replace(/\+$/, "");
  const match = /^(-?\d*\.?\d+)([a-z]*)$/i.exec(compact);
  if (match === null) return Number.NaN;
  const suffix = (match[2] ?? "").toLowerCase();
  const scale = suffix === "" ? 1 : SUFFIX_SCALE[suffix];
  if (scale === undefined) return Number.NaN;
  const precise = Number((Number(match[1]) * scale).toPrecision(12));
  return Number.isFinite(precise) && precise >= 0 && precise <= MAX_POT ? precise : Number.NaN;
}

/**
 * Official skill parse: blank falls back, otherwise digits-only safe
 * integers within 0..100000, else NaN.
 */
export function parseSkillPoints(raw: string, fallback = 0): number {
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) return NaN;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SKILL_POINTS ? value : NaN;
}

/** Official exact format: grouped below 1e9, compact then scientific above. */
export function formatExact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e18) {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 2, notation: "scientific" });
  }
  if (Math.abs(value) >= 1e9) return formatCompact(value);
  return value.toLocaleString("en-GB");
}

/** Official compact format: 2 decimals below 100x scale, 0 above, then suffix. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e18) return formatExact(value);
  for (const [scale, suffix] of SUFFIXES) {
    if (Math.abs(value) >= scale) {
      const scaled = value / scale;
      return (
        scaled.toLocaleString("en-GB", {
          maximumFractionDigits: Math.abs(scaled) >= 100 ? 0 : 2,
          useGrouping: false,
        }) + suffix
      );
    }
  }
  return Math.round(value).toLocaleString("en-GB");
}

/** Official result format, with optional stat-specific precision and prefix. */
export function formatDamage(value: number, options?: { readonly decimals?: number; readonly approximate?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = options?.decimals ?? 3;
  const customDecimals = options?.decimals !== undefined;
  const prefix = options?.approximate === false ? "" : "~ ";
  if (Math.abs(value) >= 1e18) {
    if (!customDecimals) return `${prefix}${formatExact(value)}`;
    return `${prefix}${value.toLocaleString("en-GB", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
      notation: "scientific",
    })}`;
  }
  for (const [scale, suffix] of SUFFIXES) {
    if (Math.abs(value) >= scale) return `${prefix}${(value / scale).toFixed(decimals)}${suffix}`;
  }
  if (customDecimals) {
    return `${prefix}${value.toLocaleString("en-GB", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    })}`;
  }
  return `${prefix}${Math.round(value).toLocaleString("en-GB")}`;
}
