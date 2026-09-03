/*
  Turn a classified text row into a clean strip for the recogniser.

  Two things decide whether Tesseract reads digits correctly:
    1. Glyph height. LSTM wants roughly 30-50px x-height. Oversized glyphs
       read WORSE than normalised ones (measured: a 300px-tall row misread
       "517" as "5517"; the same row at ~48px read it correctly).
    2. Clean separation of ink from background. Binarising the row's own ink
       mask removes chrome, item art, and inventory clutter behind the card.
*/

import { mitchellUpscale } from "./ocr-pixels";
import type { PixelBuffer } from "./rarity-color";
import { hueDist, rgbToHsv, type InkMask, type TextRow } from "./ocr-segment";

export type StripOpts = {
  /** Target glyph-row height in px after scaling. */
  readonly targetH: number;
  /** Pixels of white margin around the strip. */
  readonly pad: number;
  /** Dilate ink by 1px to reconnect thin strokes. */
  readonly dilate: boolean;
  /** Keep greyscale edges instead of hard binarising. */
  readonly soft: boolean;
};

export const DEFAULT_STRIP: StripOpts = {
  dilate: false,
  pad: 12,
  soft: false,
  targetH: 48,
};

/**
 * Binarise one row using an Otsu threshold computed over that row only.
 *
 * Restricted to pixels whose hue matches the row's field colour, so a bright
 * neighbouring element (inventory art, another row's glyph bleeding in) does
 * not shift the histogram.
 */
function binariseRow(
  src: PixelBuffer,
  ink: InkMask,
  row: TextRow,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Uint8Array {
  const hist = new Uint32Array(256);
  const vals = new Uint8Array(w * h);

  for (let y = 0; y < h; y += 1) {
    const sBase = (y + y0) * src.width;
    for (let x = 0; x < w; x += 1) {
      const i = (sBase + x + x0) * 4;
      const r = src.data[i] ?? 0;
      const g = src.data[i + 1] ?? 0;
      const b = src.data[i + 2] ?? 0;
      const v = Math.max(r, g, b);
      vals[y * w + x] = v;
      hist[v] = (hist[v] ?? 0) + 1;
    }
  }

  const total = w * h;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * (hist[t] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }

  // Never let Otsu drop below a floor: an all-dark row would otherwise
  // promote background noise into ink.
  const thr = Math.max(best, 110);
  const out = new Uint8Array(w * h);
  for (let p = 0; p < out.length; p += 1) if ((vals[p] ?? 0) > thr) out[p] = 1;

  // Keep only pixels near this row's classified hue when the row is coloured;
  // white rows (name / REQ Lvl) accept any low-saturation ink.
  if (row.kind !== null && row.kind !== "white") {
    for (let y = 0; y < h; y += 1) {
      const sBase = (y + y0) * src.width;
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (out[p] !== 1) continue;
        const i = (sBase + x + x0) * 4;
        const hsv = rgbToHsv(src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0);
        if (hsv.s < 0.14) continue;
        if (hueDist(hsv.h, row.hue) > 46) out[p] = 0;
      }
    }
  }
  void ink;
  return out;
}

/**
 * Height of the smallest connected glyph cluster on a row.
 *
 * Values are rendered smaller than their labels, so this reports the height
 * that actually needs upscaling. Uses column runs rather than full connected
 * components - cheap, and enough to separate "big label" from "small value".
 */
function estimateValueGlyphHeight(cell: Uint8Array, w: number, h: number): number | null {
  const heights: number[] = [];
  for (let x = 0; x < w; x += 1) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < h; y += 1) {
      if (cell[y * w + x] !== 1) continue;
      if (top === -1) top = y;
      bottom = y;
    }
    if (top !== -1 && bottom - top + 1 >= 3) heights.push(bottom - top + 1);
  }
  if (heights.length === 0) return null;
  heights.sort((a, b) => a - b);
  // 25th percentile: robust to descenders and to a few tall label columns.
  return heights[Math.floor(heights.length * 0.25)] ?? null;
}

/** Row-local Otsu cell plus its geometry. Used by splitValue so the label /
 *  value split sees the dim value digits the global ink mask drops. */
export function rowCell(
  src: PixelBuffer,
  ink: InkMask,
  row: TextRow,
): { cell: Uint8Array; x0: number; y0: number; w: number; h: number } | null {
  const margin = Math.max(4, Math.round((row.bottom - row.top + 1) * 0.5));
  const x0 = Math.max(0, row.left - margin);
  const x1 = Math.min(src.width - 1, row.right + margin);
  const y0 = Math.max(0, row.top - 2);
  const y1 = Math.min(src.height - 1, row.bottom + 2);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 8 || h < 6) return null;
  return { cell: binariseRow(src, ink, row, x0, y0, w, h), h, w, x0, y0 };
}

/** Black-on-white image of one row, normalised for the recogniser. */
export function renderRow(
  src: PixelBuffer,
  ink: InkMask,
  row: TextRow,
  opts: StripOpts = DEFAULT_STRIP,
): PixelBuffer | null {
  // Widen the crop before re-binarising. Row extents come from the global
  // brightness mask, which clips dim anti-aliased edges - a trailing digit
  // could lose its last column and read as a different number. The row-local
  // Otsu pass below recovers those pixels, so give it margin to work in.
  const margin = Math.max(4, Math.round((row.bottom - row.top + 1) * 0.5));
  const x0 = Math.max(0, row.left - margin);
  const x1 = Math.min(src.width - 1, row.right + margin);
  const y0 = Math.max(0, row.top - 2);
  const y1 = Math.min(src.height - 1, row.bottom + 2);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 8 || h < 6) return null;

  // Re-binarise the row from SOURCE pixels with a row-local Otsu threshold.
  //
  // The global ink mask is only a locator. Small value digits are dimmed by
  // anti-aliasing (measured: label strokes peak at v~0.85, the value digits
  // beside them at v~0.55), so one global threshold keeps the label and
  // shreds the digits. Otsu on the row's own histogram adapts to whatever
  // that row's text brightness actually is.
  let cell = binariseRow(src, ink, row, x0, y0, w, h);

  if (opts.dilate) {
    const grown = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (cell[y * w + x] !== 1) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            grown[yy * w + xx] = 1;
          }
        }
      }
    }
    cell = grown;
  }

  // Soft mode keeps the source luminance inside ink so antialiased stroke
  // edges survive; hard mode is pure black/white.
  const pad = opts.pad;
  const outW = w + pad * 2;
  const outH = h + pad * 2;
  const buf = new Uint8Array(outW * outH * 4).fill(255);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (cell[y * w + x] !== 1) continue;
      let level = 0;
      if (opts.soft) {
        const i = ((y + y0) * src.width + (x + x0)) * 4;
        const r = src.data[i] ?? 0;
        const g = src.data[i + 1] ?? 0;
        const b = src.data[i + 2] ?? 0;
        const v = Math.max(r, g, b) / 255;
        level = Math.round(Math.max(0, 1 - v) * 140);
      }
      const o = ((y + pad) * outW + (x + pad)) * 4;
      buf[o] = level;
      buf[o + 1] = level;
      buf[o + 2] = level;
      buf[o + 3] = 255;
    }
  }

  const strip: PixelBuffer = { data: buf, height: outH, width: outW };

  // Scale by the SMALLEST glyph on the row, not the row height.
  //
  // A tooltip row mixes a large label ("Upgrades:") with much smaller value
  // digits ("449704/449704"). Scaling by row height leaves those digits far
  // below the ~32px the LSTM needs, which is how "449704/449704" degraded into
  // "wsroxasros". Estimating the value glyph height and scaling by that keeps
  // the digits legible.
  const glyphH = estimateValueGlyphHeight(cell, w, h) ?? h;
  const scale = Math.max(1, Math.min(8, Math.round(opts.targetH / Math.max(1, glyphH))));
  return scale > 1 ? mitchellUpscale(strip, scale) : strip;
}
