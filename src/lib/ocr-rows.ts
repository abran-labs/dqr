/*
  Structure-first tooltip reader.

  The original pipeline OCR'd the whole card as English prose and repaired the
  wreckage downstream, which is why a numeric field could come back as
  "wsroxasros". This module instead finds the card, splits it into text rows,
  identifies each row by the colour DQR renders it in, and reads only the
  value part of that row as digits.

  Recognition is an ensemble:
    - Template matching against the fixed tooltip font (`ocr-glyphs.ts`).
      Exact and fast on large glyphs, and it CANNOT emit a letter where a
      digit belongs. Used whenever its per-character correlation is high.
    - Tesseract, for rows where glyph cutting is ambiguous (small, touching
      upgrade digits).

  Measured on the 28-image labeled corpus (bench/): 96.8% field accuracy with
  2 wrong values, versus 75.9% and 11 wrong for the previous whole-card
  pipeline. See bench/README.md.
*/

import type { Worker } from "tesseract.js";
import { PSM } from "tesseract.js";

import { DIGIT_TEMPLATES } from "./ocr-templates";
import { readGlyphs } from "./ocr-read-glyphs";
import {
  cropToCard,
  describeRows,
  findRows,
  inkMask,
  splitValue,
  type TextRow,
} from "./ocr-segment";
import { renderRow, rowCell } from "./ocr-strip";
import type { PixelBuffer } from "./rarity-color";

/* Tesseract accepts a canvas directly. Encoding PNGs here would drag
   node:zlib and Buffer into the browser bundle (png-rgba.ts is test-only). */
function toCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = buf.width;
  canvas.height = buf.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  const image = ctx.createImageData(buf.width, buf.height);
  image.data.set(buf.data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Numeric fields read straight off the card. */
export type RowReads = {
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
  /** Item title text, for name matching. */
  readonly nameText: string;
  /** Mean per-row confidence, 0-100. Null when nothing was read. */
  readonly confidence: number | null;
};

const DIGITS = "0123456789/";
/** Below this per-character correlation we do not trust a template read. */
const TEMPLATE_MIN_SCORE = 0.7;

function digitsOf(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function asNum(s: string): number | null {
  const d = digitsOf(s);
  if (d === "" || d.length > 15) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Recover "done/total" from a digit run whose slash was lost or misread.
 *
 * Fully-upgraded items show "N/N", so an even-length run splitting into two
 * equal halves is unambiguous. The slash is also often read as a digit
 * (measured: "436147/436147" -> "4361471436147"), so an odd-length run whose
 * halves match around one dropped character is recovered too.
 */
function splitPair(d: string): readonly [number, number] | null {
  if (d.length >= 2 && d.length % 2 === 0) {
    const half = d.length / 2;
    if (d.slice(0, half) === d.slice(half)) {
      const n = Number(d.slice(0, half));
      if (Number.isSafeInteger(n)) return [n, n];
    }
  }
  if (d.length >= 3 && d.length % 2 === 1) {
    const half = (d.length - 1) / 2;
    if (d.slice(0, half) === d.slice(half + 1)) {
      const n = Number(d.slice(0, half));
      if (Number.isSafeInteger(n)) return [n, n];
    }
  }
  return null;
}

function parseUpgrades(text: string): { done: number | null; total: number | null } {
  const t = text.replace(/\s+/g, "");
  const slash = t.indexOf("/");
  if (slash !== -1) {
    const a = asNum(t.slice(0, slash));
    const b = asNum(t.slice(slash + 1));
    if (a !== null && b !== null) {
      return a <= b ? { done: a, total: b } : { done: b, total: a };
    }
  }
  const d = digitsOf(t);
  // "0/141151" frequently loses its slash; a leading zero means none done.
  if (d.length > 1 && d.startsWith("0")) {
    const rest = Number(d.slice(1));
    if (Number.isSafeInteger(rest)) return { done: 0, total: rest };
  }
  const halves = splitPair(d);
  if (halves !== null) return { done: halves[0], total: halves[1] };
  return { done: null, total: asNum(d) };
}

type Mutable = {
  physical: number | null;
  spell: number | null;
  health: number | null;
  upsDone: number | null;
  upsTotal: number | null;
};

/** One row's attempt at a field, with the evidence needed to rank it. */
type Candidate = {
  readonly kind: string;
  readonly text: string;
  /** Recogniser confidence, 0-1. */
  readonly score: number;
  /** Ink pixels in the row - chrome slivers are tiny, real rows are not. */
  readonly ink: number;
  /** Row height in px. */
  readonly height: number;
};

/**
 * Rank candidates for one field and return the winner.
 *
 * Taking the first row that produced a number is unsafe: chrome bands and
 * label fragments are classified by hue just like real rows, and they can
 * sort ABOVE the real one. Measured on a card where a junk row at y=425 read
 * "4" while the real 971 sat at y=670 - first-wins picked the junk.
 *
 * Everything below is available at RUNTIME. An earlier version broke the tie
 * using digit count, which only worked because it had been tuned against
 * ground truth the app does not have when a user pastes an image.
 */
function bestCandidate(list: readonly Candidate[]): string | null {
  if (list.length === 0) return null;
  let best: Candidate | null = null;
  let bestRank = -Infinity;
  for (const c of list) {
    const digitCount = digitsOf(c.text).length;
    if (digitCount === 0) continue;
    // A real value row has: recogniser confidence, enough ink to be text
    // rather than a chrome sliver, and a plausible glyph height.
    const rank =
      c.score * 3 + Math.min(1, c.ink / 800) + Math.min(1, c.height / 40) + Math.min(1, digitCount / 4);
    if (rank > bestRank) {
      bestRank = rank;
      best = c;
    }
  }
  return best?.text ?? null;
}

/** Collect a row's reading as a candidate for its field. */
function addCandidate(
  buckets: Map<string, Candidate[]>,
  kind: string | null,
  cand: Candidate,
): void {
  if (kind === null) return;
  const list = buckets.get(kind) ?? [];
  list.push(cand);
  buckets.set(kind, list);
}

/** Resolve every field from its ranked candidates. */
function resolveFields(buckets: Map<string, Candidate[]>, out: Mutable): void {
  const ups = bestCandidate(buckets.get("upgrades") ?? []);
  if (ups !== null) {
    const { done, total } = parseUpgrades(ups);
    out.upsDone = done;
    out.upsTotal = total;
  }
  for (const kind of ["physical", "spell", "health"] as const) {
    const text = bestCandidate(buckets.get(kind) ?? []);
    if (text === null) continue;
    const n = asNum(text);
    if (n === null || n <= 0) continue;
    out[kind] = n;
  }
}

function segmentRows(img: PixelBuffer): { rows: TextRow[]; ink: ReturnType<typeof inkMask> } {
  const ink = inkMask(img);
  const bands = findRows(ink) as unknown as { top: number; bottom: number }[];
  return { ink, rows: describeRows(img, ink, bands) };
}

/** Read every tooltip field from one decoded screenshot. */
export async function readTooltipRows(
  worker: Worker,
  source: PixelBuffer,
): Promise<RowReads> {
  // Phone screenshots put a small card in a large frame; locate it first so
  // later thresholds see the card rather than the whole scene.
  let img = source;
  const probe = segmentRows(img);
  const cropped = cropToCard(img, probe.rows);
  if (cropped !== null) img = cropped;

  const { ink, rows } = segmentRows(img);

  await worker.setParameters({
    tessedit_char_whitelist: DIGITS,
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });

  const out: Mutable = {
    health: null,
    physical: null,
    spell: null,
    upsDone: null,
    upsTotal: null,
  };
  const confs: number[] = [];
  // Every row that yields digits becomes a CANDIDATE for its field; the winner
  // is chosen after all rows are read, by runtime-observable evidence only.
  const buckets = new Map<string, Candidate[]>();

  for (const row of rows) {
    if (row.kind === null || row.kind === "white" || row.kind === "sell") continue;

    // Read only the value half when a clear label/value boundary exists; the
    // digit whitelist would otherwise try to read the label's letters.
    const vs = splitValue(ink, row);
    const target = vs === null ? row : { ...row, left: vs.left, right: vs.right };

    const height = row.bottom - row.top + 1;
    const cell = rowCell(img, ink, target);
    const templateRead =
      cell === null ? null : readGlyphs(cell.cell, cell.w, cell.h, DIGIT_TEMPLATES);
    if (
      templateRead !== null &&
      templateRead.text !== "" &&
      templateRead.minScore >= TEMPLATE_MIN_SCORE
    ) {
      confs.push(templateRead.minScore * 100);
      addCandidate(buckets, row.kind, {
        height,
        ink: row.inkCount,
        kind: row.kind,
        score: templateRead.minScore,
        text: templateRead.text,
      });
      continue;
    }

    const strip = renderRow(img, ink, target);
    if (strip === null) continue;
    const res = await worker.recognize(toCanvas(strip));
    const text = res.data.text.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    confs.push(res.data.confidence);
    addCandidate(buckets, row.kind, {
      height,
      ink: row.inkCount,
      kind: row.kind,
      score: res.data.confidence / 100,
      text,
    });
  }

  resolveFields(buckets, out);

  // The title is the topmost strongly-white row. Use whiteness directly
  // rather than the row's classified kind: a title over coloured chrome can
  // pick up a palette hue and be classified as a value row.
  let nameText = "";
  const titleRow = rows
    .filter((r) => r.whiteness > 0.55)
    .sort((a, b) => a.top - b.top)[0];
  if (titleRow !== undefined) {
    const strip = renderRow(img, ink, titleRow);
    if (strip !== null) {
      await worker.setParameters({
        tessedit_char_whitelist: "",
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });
      const res = await worker.recognize(toCanvas(strip));
      nameText = res.data.text.trim();
    }
  }

  return {
    confidence: confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
    health: out.health,
    nameText,
    physical: out.physical,
    spell: out.spell,
    upsDone: out.upsDone,
    upsTotal: out.upsTotal,
  };
}
