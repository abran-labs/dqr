/*
  Structure-first tooltip segmentation.

  The shipped pipeline OCRs the whole card as English prose and repairs the
  wreckage downstream. That is why a value field can come back "wsroxasros".

  This module does the opposite: find the card, find the text rows, classify
  each row by the colour DQR renders it in, then hand each row to the
  recogniser as an isolated digits-only strip.

  Key properties:
    - Row-local. A cropped screenshot missing Health still reads the rest,
      because rows are identified by their own colour, not by position.
    - Chrome-safe. Card chrome shares hues with text (gold Legendary vs the
      yellow Sell row), so ink is separated from chrome by local contrast,
      not by hue alone.
*/

import type { PixelBuffer } from "./rarity-color";

export type FieldKind = "physical" | "spell" | "health" | "upgrades" | "sell" | "white";

export type TextRow = {
  readonly kind: FieldKind | null;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** Mean saturation-weighted hue of the row's ink, degrees. */
  readonly hue: number;
  /** Fraction of ink pixels that are near-white. */
  readonly whiteness: number;
  readonly inkCount: number;
};

export type Hsv = { h: number; s: number; v: number };

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

export function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}


/* DQR tooltip palette, measured across the corpus. Text is bright and
   saturated; chrome is the same hue but darker, so `v` gates them apart. */
const PALETTE: readonly { kind: FieldKind; hue: number; tol: number }[] = [
  // Tolerances measured across the corpus. Spell runs 260-308 degrees: gold
  // and red card chrome bleeds into the light-purple text and pushes its hue
  // well past the nominal value, so the window has to reach 310.
  { hue: 6, kind: "physical", tol: 20 },
  { hue: 283, kind: "spell", tol: 30 },
  { hue: 96, kind: "health", tol: 30 },
  { hue: 207, kind: "upgrades", tol: 24 },
  { hue: 50, kind: "sell", tol: 18 },
];


export type InkMask = {
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
};

/**
 * Ink = pixels matching a known tooltip text colour, brighter than the local
 * background.
 *
 * Pure local-contrast fails on this UI: large glyphs have flat interiors that
 * look like chrome, so a tight threshold hollows them out while a loose one
 * floods the whole card. Instead each pixel is tested against the DQR palette
 * (a small set of known text hues, plus white), and only needs to beat its
 * local background by a small margin. Chrome is rejected because it is darker,
 * desaturated, or off-palette - not because it lacks contrast.
 */
export function inkMask(src: PixelBuffer, minV = 0.62, _unused = 0): InkMask {
  const { data, height, width } = src;

  // Glyphs are SOLID, not outlined. An edge/local-contrast test keeps only
  // stroke boundaries and hollows the characters out - which destroyed small
  // digits entirely. Measured on the corpus, a plain brightness test is
  // sufficient and keeps glyph interiors:
  //   glyph pixels  v ~ 0.70-0.95
  //   card interior v ~ 0.20-0.30
  //   chrome/border v ~ 0.05
  // Hue is NOT used to accept a pixel - only later, to decide which field a
  // row belongs to. Chrome that shares a text hue is rejected on brightness.
  // Legendary/Ultimate cards render bright gold or red CHROME that passes a
  // plain brightness test and floods the mask (measured on 71.png: 11.5% ink,
  // segmentation collapsed).
  //
  // Chrome is the card's dominant bright colour; text is a minority colour on
  // top of it. So compute the dominant bright hue over the whole image and
  // reject pixels that match it, UNLESS they are much brighter than the local
  // background (glyph strokes still stand out against their own chrome).
  const hueVotes = new Float32Array(72);
  let brightTotal = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (Math.max(r, g, b) / 255 < minV) continue;
    brightTotal += 1;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.2) continue;
    const bucket = Math.min(71, Math.floor(hsv.h / 5));
    hueVotes[bucket] = (hueVotes[bucket] ?? 0) + 1;
  }
  // Chrome hue spreads over several 5-degree buckets (measured on 71.png:
  // 30deg 20% + 35deg 13% + 50deg 10%), so score a +/-15 degree window
  // rather than a single bucket.
  let domBucket = -1;
  let domVotes = 0;
  for (let i = 0; i < 72; i += 1) {
    let sum = 0;
    for (let d = -3; d <= 3; d += 1) sum += hueVotes[(i + d + 72) % 72] ?? 0;
    if (sum > domVotes) {
      domVotes = sum;
      domBucket = i;
    }
  }
  const chromeHue = brightTotal > 0 && domVotes / brightTotal > 0.3 ? domBucket * 5 + 2.5 : -1;

  const val = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    val[p] = Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) / 255;
  }
  const rad = Math.max(2, Math.round(Math.min(width, height) / 150));
  const blur = boxBlur(val, width, height, rad);

  // NOTE: a looser threshold for dim value digits was tried here and made
  // things WORSE (84.2% -> 64.6%): the extra pixels bridged the gaps between
  // tooltip lines, so rows merged and whole fields disappeared. Row-local
  // Otsu in strip.ts is the right place to recover dim glyphs, because it
  // runs AFTER segmentation has already separated the lines.
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const v = val[p] ?? 0;
    const local = blur[p] ?? 0;
    if (v < minV) continue;
    if (chromeHue >= 0) {
      const hsv = rgbToHsv(r, g, b);
      if (hsv.s >= 0.2 && hueDist(hsv.h, chromeHue) <= 18) {
        // Same hue as the card chrome: keep only if it is a bright stroke
        // standing proud of its surroundings.
        if (v - local < 0.1) continue;
      }
    }
    mask[p] = 1;
  }
  return { height, mask, width };
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let acc = 0;
    let n = 0;
    for (let x = -r; x <= r; x += 1) {
      if (x >= 0 && x < w) {
        acc += src[y * w + x] ?? 0;
        n += 1;
      }
    }
    for (let x = 0; x < w; x += 1) {
      tmp[y * w + x] = acc / n;
      const add = x + r + 1;
      const sub = x - r;
      if (add < w) {
        acc += src[y * w + add] ?? 0;
        n += 1;
      }
      if (sub >= 0) {
        acc -= src[y * w + sub] ?? 0;
        n -= 1;
      }
    }
  }
  for (let x = 0; x < w; x += 1) {
    let acc = 0;
    let n = 0;
    for (let y = -r; y <= r; y += 1) {
      if (y >= 0 && y < h) {
        acc += tmp[y * w + x] ?? 0;
        n += 1;
      }
    }
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = acc / n;
      const add = y + r + 1;
      const sub = y - r;
      if (add < h) {
        acc += tmp[add * w + x] ?? 0;
        n += 1;
      }
      if (sub >= 0) {
        acc -= tmp[sub * w + x] ?? 0;
        n -= 1;
      }
    }
  }
  return out;
}

/**
 * Horizontal ink bands via projection profile.
 *
 * Two refinements over a plain profile:
 *  - Rows are cut at LOCAL MINIMA as well as at empty gaps. Tooltip lines are
 *    tightly stacked ("Physical / power:" over "Spell / Power:"), so adjacent
 *    rows often touch and would otherwise merge into one unreadable band.
 *  - Very tall bands are recursively split, since a merged band is always
 *    wrong: no single tooltip line is a large fraction of the card.
 */
export function findRows(ink: InkMask, minHeightFrac = 0.012): TextRow[] {
  const { height, mask, width } = ink;
  const counts = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    const base = y * width;
    for (let x = 0; x < width; x += 1) if (mask[base + x] === 1) n += 1;
    counts[y] = n;
  }

  const minInk = Math.max(3, Math.round(width * 0.004));
  const minH = Math.max(6, Math.round(height * minHeightFrac));
  const bands: { top: number; bottom: number }[] = [];
  let start = -1;
  let gap = 0;
  const maxGap = Math.max(1, Math.round(height * 0.004));

  for (let y = 0; y < height; y += 1) {
    const on = (counts[y] ?? 0) >= minInk;
    if (on) {
      if (start === -1) start = y;
      gap = 0;
    } else if (start !== -1) {
      gap += 1;
      if (gap > maxGap) {
        const bottom = y - gap;
        if (bottom - start + 1 >= minH) bands.push({ bottom, top: start });
        start = -1;
        gap = 0;
      }
    }
  }
  if (start !== -1 && height - start >= minH) bands.push({ bottom: height - 1, top: start });

  // Split over-tall bands at their thinnest interior scanline.
  const maxH = Math.max(minH * 3, Math.round(height * 0.16));
  const out: { top: number; bottom: number }[] = [];
  const queue = [...bands];
  let guard = 0;
  while (queue.length > 0 && guard < 500) {
    guard += 1;
    const b = queue.shift()!;
    const h = b.bottom - b.top + 1;
    if (h <= maxH) {
      out.push(b);
      continue;
    }
    const lo = b.top + minH;
    const hi = b.bottom - minH;
    if (hi <= lo) {
      out.push(b);
      continue;
    }
    let cutAt = -1;
    let cutVal = Infinity;
    for (let y = lo; y <= hi; y += 1) {
      const c = counts[y] ?? 0;
      if (c < cutVal) {
        cutVal = c;
        cutAt = y;
      }
    }
    if (cutAt < 0) {
      out.push(b);
      continue;
    }
    queue.push({ bottom: cutAt - 1, top: b.top }, { bottom: b.bottom, top: cutAt + 1 });
  }

  out.sort((a, b) => a.top - b.top);
  return out as unknown as TextRow[];
}

/** Attach horizontal extent + colour identity to each band. */
export function describeRows(
  src: PixelBuffer,
  ink: InkMask,
  bands: readonly { top: number; bottom: number }[],
): TextRow[] {
  const { data } = src;
  const { mask, width } = ink;
  const out: TextRow[] = [];

  const colInk = new Uint8Array(width);

  for (const band of bands) {
    let left = width;
    let right = -1;
    let inkCount = 0;
    let white = 0;
    let sx = 0;
    let sy = 0;
    colInk.fill(0);

    for (let y = band.top; y <= band.bottom; y += 1) {
      const base = y * width;
      for (let x = 0; x < width; x += 1) {
        if (mask[base + x] !== 1) continue;
        inkCount += 1;
        colInk[x] = 1;
        if (x < left) left = x;
        if (x > right) right = x;
        const i = (base + x) * 4;
        const hsv = rgbToHsv(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
        if (hsv.s < 0.18) white += 1;
        else {
          // Weight by saturation so washed-out edge pixels do not drag the hue.
          const rad = (hsv.h * Math.PI) / 180;
          sx += Math.cos(rad) * hsv.s;
          sy += Math.sin(rad) * hsv.s;
        }
      }
    }
    if (right < 0 || inkCount === 0) continue;

    // Reject bands whose SHAPE cannot be text, before asking what colour they
    // are. Hue alone cannot do this: card chrome shares hues with real fields
    // (gold Legendary chrome sits on `sell`'s 50deg, red Ultimate chrome on
    // `physical`'s 6deg), so a colour-only classifier hands chrome a field and
    // it competes with the real row.
    //
    // Text has a distinctive footprint, measured across the corpus:
    //   real text rows : 44-79% of columns inked, 9-21 separate column runs
    //   chrome slivers : 0.4-3.6% of columns, 2-4 runs, spanning the full card
    //                    width - the card's own left/right border with nothing
    //                    between it
    //   divider bars   : 52-92% ink density in a SINGLE run, every column full
    // The gap between the groups is wide (3.6% vs 5.6% column fill), so this
    // does not need a finely tuned threshold.
    let cols = 0;
    let runs = 0;
    let prevOn = false;
    for (let x = left; x <= right; x += 1) {
      const on = colInk[x] === 1;
      if (on) {
        cols += 1;
        if (!prevOn) runs += 1;
      }
      prevOn = on;
    }
    const bandW = right - left + 1;
    const bandH = band.bottom - band.top + 1;
    const colFill = bandW > 0 ? cols / bandW : 0;
    const density = bandW > 0 && bandH > 0 ? inkCount / (bandW * bandH) : 0;

    // A wide band with almost no inked columns is border bleed, not a line of
    // text. Requiring several runs as well keeps a legitimately short value
    // (a lone "7") from being discarded.
    if (colFill < 0.05 && runs <= 4) continue;
    // A near-solid single stripe is a divider rule.
    if (density > 0.45 && runs <= 3) continue;

    let hue = 0;
    if (sx !== 0 || sy !== 0) {
      hue = (Math.atan2(sy, sx) * 180) / Math.PI;
      if (hue < 0) hue += 360;
    }
    const whiteness = white / inkCount;

    // Hue wins over whiteness. Small anti-aliased digits carry a lot of
    // desaturated edge pixels, so a genuine coloured row can read as 66%
    // "white" (measured: 61.png's Upgrades row, hue 204, was classified
    // white and its value silently dropped). Only fall back to white when
    // no palette hue matches.
    let kind: FieldKind | null = null;
    let best = Infinity;
    for (const p of PALETTE) {
      const d = hueDist(hue, p.hue);
      if (d <= p.tol && d < best) {
        best = d;
        kind = p.kind;
      }
    }
    // Genuinely white text (item name, REQ Lvl) is overwhelmingly desaturated;
    // a coloured row with anti-aliasing tops out well below that.
    if (whiteness > 0.82) kind = "white";
    else if (kind === null && whiteness > 0.55) kind = "white";

    out.push({ bottom: band.bottom, hue, inkCount, kind, left, right, top: band.top, whiteness });
  }
  return out;
}

/**
 * Crop to the tooltip card.
 *
 * Phone screenshots put a small card in a huge frame; the densest cluster of
 * classifiable tooltip rows locates it without template matching.
 */
export function cropToCard(src: PixelBuffer, rows: readonly TextRow[]): PixelBuffer | null {
  // A chrome-panel detector was tried here (vote for the dominant dark rarity
  // hue, keep the block where it dominates) and measured WORSE: 96.8% -> 89.9%.
  // It clipped real content, because the rarity tint continues past the card
  // into the scene behind it and the panel edge is not where the hue stops.
  // Junk rows are handled at selection time instead - see `bestCandidate` in
  // `ocr-rows.ts`, which ranks rows by confidence, ink and geometry rather
  // than trusting whichever row appears first.
  const useful = rows.filter((r) => r.kind !== null);
  if (useful.length < 2) return null;

  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const r of useful) {
    if (r.top < top) top = r.top;
    if (r.bottom > bottom) bottom = r.bottom;
    if (r.left < left) left = r.left;
    if (r.right > right) right = r.right;
  }
  const padX = Math.round((right - left) * 0.06) + 6;
  const padY = Math.round((bottom - top) * 0.06) + 6;
  const x0 = Math.max(0, left - padX);
  const y0 = Math.max(0, top - padY);
  const x1 = Math.min(src.width - 1, right + padX);
  const y1 = Math.min(src.height - 1, bottom + padY);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 32 || h < 32) return null;
  if (w * h > src.width * src.height * 0.98) return null;

  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const srcBase = ((y + y0) * src.width + x0) * 4;
    data.set(src.data.subarray(srcBase, srcBase + w * 4), y * w * 4);
  }
  return { data, height: h, width: w };
}

export function segment(src: PixelBuffer): { rows: TextRow[]; ink: InkMask } {
  const ink = inkMask(src);
  const bands = findRows(ink) as unknown as { top: number; bottom: number }[];
  return { ink, rows: describeRows(src, ink, bands) };
}

/**
 * Split a row into label part and value part at the widest internal gap.
 *
 * A tooltip row is "Upgrades:            449704/449704" - a big label, a wide
 * blank, then the digits. Feeding both to a digit-whitelisted recogniser makes
 * it try to read the label's letters as digits, which corrupts the value
 * (measured: the whole row returned "47" while the value alone reads
 * "449704/449704"). The value is always the RIGHTMOST segment.
 */
export function splitValue(ink: InkMask, row: TextRow): { left: number; right: number } | null {
  const { mask, width } = ink;
  const w = row.right - row.left + 1;
  if (w < 24) return null;

  const cols = new Uint8Array(w);
  for (let y = row.top; y <= row.bottom; y += 1) {
    const base = y * width;
    for (let x = 0; x < w; x += 1) {
      if (mask[base + x + row.left] === 1) cols[x] = 1;
    }
  }

  // Collect interior gaps.
  const gaps: { start: number; len: number }[] = [];
  let runStart = -1;
  for (let x = 0; x <= w; x += 1) {
    const empty = x < w && cols[x] === 0;
    if (empty) {
      if (runStart === -1) runStart = x;
    } else if (runStart !== -1) {
      if (runStart > 0 && x < w) gaps.push({ len: x - runStart, start: runStart });
      runStart = -1;
    }
  }
  if (gaps.length === 0) return null;

  // Widest interior gap = label/value separator. A height-based split (value
  // glyphs are shorter than label glyphs) was tried and scored far worse
  // (84.2% -> 25% on physical): it cut INTO the value, because digits vary in
  // height among themselves nearly as much as label-vs-value does.
  //
  // Only gaps in the LEFT 70% can be the separator. Beyond that we are inside
  // the value, where inter-digit spacing produced slivers (measured on
  // 73.png: a 1245px row was cut down to 152px, losing every digit).
  const limit = Math.round(w * 0.7);
  const minGap = Math.max(3, Math.round((row.bottom - row.top + 1) * 0.1));

  // Per-column glyph extents, used to test what follows each candidate gap.
  const top = new Int32Array(w).fill(-1);
  const bot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x += 1) {
    for (let y = row.top; y <= row.bottom; y += 1) {
      if (mask[y * width + x + row.left] !== 1) continue;
      if (top[x] === -1) top[x] = y;
      bot[x] = y;
    }
  }
  const tallest = (from: number, to: number): number => {
    let m = 0;
    for (let x = Math.max(0, from); x <= Math.min(w - 1, to); x += 1) {
      if (top[x] === -1) continue;
      const hh = (bot[x] ?? 0) - (top[x] ?? 0) + 1;
      if (hh > m) m = hh;
    }
    return m;
  };
  const rowH = row.bottom - row.top + 1;

  // Prefer the gap after which glyphs become SHORT - that is the label/value
  // boundary. Falling back to "widest gap" alone kept the label on wide cards
  // (measured on 82.png: a 94%-of-row "value" that still contained
  // "Upgrades:"), which then fed letters to a digit-only recogniser.
  let bestStart = -1;
  let bestLen = 0;
  let bestShort = -1;
  let bestShortLen = 0;
  for (const g of gaps) {
    if (g.start > limit) break;
    if (g.len < minGap) continue;
    if (g.len > bestLen) {
      bestLen = g.len;
      bestStart = g.start;
    }
    const after = tallest(g.start + g.len, w - 1);
    const before = tallest(0, g.start - 1);
    if (before > 0 && after > 0 && after <= before * 0.8 && after <= rowH * 0.85) {
      if (g.len > bestShortLen) {
        bestShortLen = g.len;
        bestShort = g.start + g.len;
      }
    }
  }

  const cut = bestShort >= 0 ? bestShort : bestStart < 0 ? -1 : bestStart + bestLen;
  if (cut < 0) return null;
  const valueLeft = row.left + cut;
  if (row.right - valueLeft + 1 < 8) return null;
  return { left: valueLeft, right: row.right };
}

