/*
  Read a digit string from a binarised row using learned templates.

  Handles the two ways column-gap cutting fails on real tooltips:
    - TOUCHING glyphs: one box that is far too wide for a single digit gets
      sliced into equal sub-boxes.
    - SPLIT glyphs: a box too narrow to be a digit is merged with its
      neighbour before classification.

  Returns per-character confidence so callers can reject a low-confidence
  read instead of autofilling a wrong number.
*/

import { classify, cutGlyphs, GRID_H, GRID_W, type Glyph, type Template } from "./ocr-glyphs";

export type GlyphRead = {
  readonly text: string;
  /** Lowest per-character correlation in the string. */
  readonly minScore: number;
  /** Lowest gap between best and runner-up template. */
  readonly minMargin: number;
  readonly chars: readonly { label: string; score: number; margin: number }[];
};

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Re-cut boxes whose width implies a different glyph count than 1.
 *
 * Digit advance width is nearly constant in a fixed font, so the median box
 * width is a reliable unit. A box ~2x that unit is two touching digits.
 */
function refine(glyphs: readonly Glyph[], cell: Uint8Array, w: number, h: number): Glyph[] {
  if (glyphs.length === 0) return [];
  const widths = glyphs.map((g) => g.right - g.left + 1);
  // "/" and "1" are narrow, so take the median of the WIDER half as the unit.
  const sorted = [...widths].sort((a, b) => a - b);
  const upper = sorted.slice(Math.floor(sorted.length / 2));
  const unit = median(upper.length > 0 ? upper : sorted);
  if (unit <= 0) return [...glyphs];

  const out: Glyph[] = [];
  for (const g of glyphs) {
    const gw = g.right - g.left + 1;
    const n = Math.round(gw / unit);
    if (n <= 1 || gw < unit * 1.55) {
      out.push(g);
      continue;
    }
    // Slice at the lowest-ink columns near each expected boundary.
    const step = gw / n;
    let prev = g.left;
    for (let i = 1; i <= n; i += 1) {
      const target = g.left + Math.round(step * i);
      let cutAt = Math.min(g.right + 1, target);
      if (i < n) {
        let bestInk = Infinity;
        const lo = Math.max(prev + 2, target - Math.round(step * 0.28));
        const hi = Math.min(g.right - 1, target + Math.round(step * 0.28));
        for (let x = lo; x <= hi; x += 1) {
          let ink = 0;
          for (let y = g.top; y <= g.bottom; y += 1) if (cell[y * w + x] === 1) ink += 1;
          if (ink < bestInk) {
            bestInk = ink;
            cutAt = x;
          }
        }
      }
      const sub = sliceBox(cell, w, h, prev, cutAt - 1);
      if (sub !== null) out.push(sub);
      prev = cutAt;
    }
  }
  return out;
}

function sliceBox(
  cell: Uint8Array,
  w: number,
  h: number,
  left: number,
  right: number,
): Glyph | null {
  if (right < left) return null;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y += 1) {
    let any = false;
    for (let x = left; x <= right; x += 1) {
      if (cell[y * w + x] === 1) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    if (top === -1) top = y;
    bottom = y;
  }
  if (top === -1) return null;
  const bw = right - left + 1;
  const bh = bottom - top + 1;
  const cells = new Float32Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    const sy0 = top + (gy * bh) / GRID_H;
    const sy1 = top + ((gy + 1) * bh) / GRID_H;
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const sx0 = left + (gx * bw) / GRID_W;
      const sx1 = left + ((gx + 1) * bw) / GRID_W;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y += 1) {
        for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x += 1) {
          sum += cell[y * w + x] === 1 ? 1 : 0;
          n += 1;
        }
      }
      cells[gy * GRID_W + gx] = n > 0 ? sum / n : 0;
    }
  }
  return { bottom, cells, left, right, top };
}

export function readGlyphs(
  cell: Uint8Array,
  w: number,
  h: number,
  templates: readonly Template[],
): GlyphRead {
  const boxes = refine(cutGlyphs(cell, w, h), cell, w, h);
  const chars: { label: string; score: number; margin: number }[] = [];
  let text = "";
  for (const g of boxes) {
    const m = classify(g, templates);
    chars.push(m);
    text += m.label;
  }
  return {
    chars,
    minMargin: chars.length === 0 ? 0 : Math.min(...chars.map((c) => c.margin)),
    minScore: chars.length === 0 ? 0 : Math.min(...chars.map((c) => c.score)),
    text,
  };
}
