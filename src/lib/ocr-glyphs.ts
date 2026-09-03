/*
  Fixed-font digit recogniser.

  DQR always renders the same font, so digit recognition is a closed 10-class
  problem on clean binary images - not a language modelling problem. Tesseract
  brings an LSTM + dictionary to that fight and loses in a specific way: it
  hallucinates plausible TEXT (measured: "449704/449704" -> "wsroxasros",
  "137619" -> "17137619").

  This module instead:
    1. cuts the row into connected glyph boxes,
    2. normalises each box to a fixed grid,
    3. scores it against templates LEARNED from the corpus itself.

  Every glyph gets an independent score, so a low-confidence digit can be
  reported instead of silently guessed.
*/

export const GRID_W = 12;
export const GRID_H = 20;

export type Glyph = {
  /** Normalised GRID_W x GRID_H coverage map, 0..1. */
  readonly cells: Float32Array;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

export type Template = {
  readonly label: string;
  readonly cells: Float32Array;
  /** Mean aspect ratio (w/h) of the training samples. */
  readonly aspect: number;
};

/** Column-gap segmentation of a binarised row into glyph boxes. */
export function cutGlyphs(cell: Uint8Array, w: number, h: number): Glyph[] {
  const colInk = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    let n = 0;
    for (let y = 0; y < h; y += 1) if (cell[y * w + x] === 1) n += 1;
    colInk[x] = n;
  }

  const boxes: { left: number; right: number }[] = [];
  let start = -1;
  for (let x = 0; x <= w; x += 1) {
    const on = x < w && (colInk[x] ?? 0) > 0;
    if (on && start === -1) start = x;
    else if (!on && start !== -1) {
      boxes.push({ left: start, right: x - 1 });
      start = -1;
    }
  }

  const glyphs: Glyph[] = [];
  for (const b of boxes) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < h; y += 1) {
      let any = false;
      for (let x = b.left; x <= b.right; x += 1) {
        if (cell[y * w + x] === 1) {
          any = true;
          break;
        }
      }
      if (!any) continue;
      if (top === -1) top = y;
      bottom = y;
    }
    if (top === -1) continue;
    const bw = b.right - b.left + 1;
    const bh = bottom - top + 1;
    // Drop specks; keep everything a digit could plausibly be.
    if (bw < 2 || bh < 4) continue;
    glyphs.push({
      bottom,
      cells: normalise(cell, w, b.left, top, bw, bh),
      left: b.left,
      right: b.right,
      top,
    });
  }
  return glyphs;
}

/** Area-average a glyph box onto the fixed grid. */
function normalise(
  cell: Uint8Array,
  stride: number,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
): Float32Array {
  const out = new Float32Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    const sy0 = y0 + (gy * bh) / GRID_H;
    const sy1 = y0 + ((gy + 1) * bh) / GRID_H;
    for (let gx = 0; gx < GRID_W; gx += 1) {
      const sx0 = x0 + (gx * bw) / GRID_W;
      const sx1 = x0 + ((gx + 1) * bw) / GRID_W;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y += 1) {
        for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x += 1) {
          sum += cell[y * stride + x] === 1 ? 1 : 0;
          n += 1;
        }
      }
      out[gy * GRID_W + gx] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

/** Zero-mean normalised cross-correlation, -1..1. */
export function correlate(a: Float32Array, b: Float32Array): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i += 1) {
    ma += a[i] ?? 0;
    mb += b[i] ?? 0;
  }
  ma /= a.length;
  mb /= b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export type Match = { label: string; score: number; margin: number };

/** Best template for a glyph, with the gap to the runner-up. */
export function classify(glyph: Glyph, templates: readonly Template[]): Match {
  let best = { label: "?", score: -1 };
  let second = -1;
  const aspect = (glyph.right - glyph.left + 1) / Math.max(1, glyph.bottom - glyph.top + 1);
  for (const t of templates) {
    let s = correlate(glyph.cells, t.cells);
    // "1" is much narrower than other digits; aspect disambiguates the
    // shapes that correlate well but cannot match the real footprint.
    const ar = Math.abs(Math.log((aspect + 0.01) / (t.aspect + 0.01)));
    s -= Math.min(0.25, ar * 0.18);
    if (s > best.score) {
      second = best.score;
      best = { label: t.label, score: s };
    } else if (s > second) second = s;
  }
  return { label: best.label, margin: best.score - Math.max(0, second), score: best.score };
}

/** Average samples per label into one template each. */
export function buildTemplates(
  samples: readonly { label: string; glyph: Glyph }[],
): Template[] {
  const byLabel = new Map<string, { glyph: Glyph }[]>();
  for (const s of samples) {
    const list = byLabel.get(s.label) ?? [];
    list.push({ glyph: s.glyph });
    byLabel.set(s.label, list);
  }
  const out: Template[] = [];
  for (const [label, list] of byLabel) {
    const cells = new Float32Array(GRID_W * GRID_H);
    let aspect = 0;
    for (const { glyph } of list) {
      for (let i = 0; i < cells.length; i += 1) cells[i] = (cells[i] ?? 0) + (glyph.cells[i] ?? 0);
      aspect += (glyph.right - glyph.left + 1) / Math.max(1, glyph.bottom - glyph.top + 1);
    }
    for (let i = 0; i < cells.length; i += 1) cells[i] = (cells[i] ?? 0) / list.length;
    out.push({ aspect: aspect / list.length, cells, label });
  }
  return out;
}
