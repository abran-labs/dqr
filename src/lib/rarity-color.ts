/*
  Tooltip-chrome rarity detection. Text colors are fixed (docs/Info/OCR-Input.md);
  only the dark card background encodes rarity. Samples: assets/Rarities/.
*/

import type { Rarity } from "./dqr-items";

export type PixelBuffer = {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

/** Dark-interior hues sampled from assets/Rarities (common is sat-gated, not hue). */
const CHROMATIC = [
  { hue: 116, rarity: "uncommon" },
  { hue: 240, rarity: "rare" },
  { hue: 292, rarity: "epic" },
  { hue: 38, rarity: "legendary" },
  { hue: 0, rarity: "ultimate" },
] as const;

const SAT_COMMON = 0.2;
const HUE_MAX = 30;
/** Skip near-black padding and bright text (white / salmon / cyan / gold). */
const VALUE_MIN = 12;
const VALUE_MAX = 88;
const MIN_VOTES = 16;
const ALPHA_MIN = 128;

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "ultimate"] as const;

export function detectRarityFromPixels(image: PixelBuffer): Rarity | null {
  const { data, width, height } = image;
  const pixels = width * height;
  if (width <= 0 || height <= 0 || data.length < pixels * 4) return null;

  const votes: Record<Rarity, number> = {
    common: 0,
    epic: 0,
    legendary: 0,
    rare: 0,
    ultimate: 0,
    uncommon: 0,
  };
  let classified = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const a = data[o + 3] ?? 0;
    if (a < ALPHA_MIN) continue;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const rarity = classifyChrome(r, g, b);
    if (rarity === null) continue;
    votes[rarity] += 1;
    classified += 1;
  }
  if (classified < MIN_VOTES) return null;

  let best: Rarity | null = null;
  let bestCount = 0;
  let tied = false;
  for (const rarity of RARITIES) {
    const count = votes[rarity];
    if (count > bestCount) {
      best = rarity;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  }
  if (tied || best === null) return null;
  return best;
}

const UPGRADE_SAT_MIN = 0.3;
const UPGRADE_VALUE_MIN = 60;
const UPGRADE_VALUE_MAX = 140;

/**
 * Upgrade-screen rarity: the item icon box and name plate are tinted by rarity
 * (rare plate is ~rgb(59,60,103)). The screen is full of gray panels and bright
 * buttons, so only dim, clearly tinted pixels vote, and gray never wins.
 * Null when no tint is found — the form's rarity picker takes over.
 */
export function detectUpgradeScreenRarity(
  image: PixelBuffer,
  /** Normalized [x0, y0, x1, y1] around the item icon + name plate. */
  box?: readonly [number, number, number, number] | null,
): Rarity | null {
  const { data, width, height } = image;
  const pixels = width * height;
  if (width <= 0 || height <= 0 || data.length < pixels * 4) return null;

  const x0 = box ? Math.max(0, Math.floor(box[0] * width)) : 0;
  const y0 = box ? Math.max(0, Math.floor(box[1] * height)) : 0;
  const x1 = box ? Math.min(width, Math.ceil(box[2] * width)) : width;
  const y1 = box ? Math.min(height, Math.ceil(box[3] * height)) : height;

  const votes = new Map<Rarity, number>();
  for (let i = 0; i < pixels; i++) {
    const px = i % width;
    const py = Math.floor(i / width);
    if (px < x0 || px >= x1 || py < y0 || py >= y1) continue;
    const o = i * 4;
    if ((data[o + 3] ?? 0) < ALPHA_MIN) continue;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const value = Math.max(r, g, b);
    if (value < UPGRADE_VALUE_MIN || value > UPGRADE_VALUE_MAX) continue;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < UPGRADE_SAT_MIN) continue;
    let best: Rarity | null = null;
    let bestDist = HUE_MAX;
    for (const entry of CHROMATIC) {
      const dist = hueDist(hsv.h, entry.hue);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry.rarity;
      }
    }
    if (best !== null) votes.set(best, (votes.get(best) ?? 0) + 1);
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top === undefined || top[1] < MIN_VOTES) return null;
  const second = ranked[1];
  if (second !== undefined && second[1] * 2 > top[1]) return null;
  return top[0];
}

function classifyChrome(r: number, g: number, b: number): Rarity | null {
  const value = Math.max(r, g, b);
  if (value < VALUE_MIN || value > VALUE_MAX) return null;
  const hsv = rgbToHsv(r, g, b);
  if (hsv.s < SAT_COMMON) return "common";
  let best: Rarity | null = null;
  let bestDist = HUE_MAX;
  for (const entry of CHROMATIC) {
    const dist = hueDist(hsv.h, entry.hue);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry.rarity;
    }
  }
  return best;
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = (60 * ((gg - bb) / delta) + 360) % 360;
    else if (max === gg) h = (60 * ((bb - rr) / delta) + 120) % 360;
    else h = (60 * ((rr - gg) / delta) + 240) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}
