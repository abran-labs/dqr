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
