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

/**
 * Assign a row's text to its field.
 *
 * `strong` marks a high-confidence template read, which may replace a weaker
 * earlier value: chrome and label fragments sometimes produce a spurious
 * leading row (measured on one card, a stray "0" claimed physical and blocked
 * the real 971 found further down).
 */
function applyRead(out: Mutable, kind: string | null, text: string, strong: boolean): void {
  if (kind === "upgrades") {
    const { done, total } = parseUpgrades(text);
    if (out.upsTotal === null && total !== null) {
      out.upsDone = done;
      out.upsTotal = total;
    }
    return;
  }
  const n = asNum(text);
  if (n === null) return;
  const take = (cur: number | null): boolean =>
    cur === null || (strong && (cur === 0 || String(cur).length < String(n).length));
  if (kind === "physical" && take(out.physical)) out.physical = n;
  else if (kind === "spell" && take(out.spell)) out.spell = n;
  else if (kind === "health" && take(out.health)) out.health = n;
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

  for (const row of rows) {
    if (row.kind === null || row.kind === "white" || row.kind === "sell") continue;

    // Read only the value half when a clear label/value boundary exists; the
    // digit whitelist would otherwise try to read the label's letters.
    const vs = splitValue(ink, row);
    const target = vs === null ? row : { ...row, left: vs.left, right: vs.right };

    const cell = rowCell(img, ink, target);
    const templateRead =
      cell === null ? null : readGlyphs(cell.cell, cell.w, cell.h, DIGIT_TEMPLATES);
    if (
      templateRead !== null &&
      templateRead.text !== "" &&
      templateRead.minScore >= TEMPLATE_MIN_SCORE
    ) {
      confs.push(templateRead.minScore * 100);
      applyRead(out, row.kind, templateRead.text, true);
      continue;
    }

    const strip = renderRow(img, ink, target);
    if (strip === null) continue;
    const res = await worker.recognize(toCanvas(strip));
    const text = res.data.text.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    confs.push(res.data.confidence);
    applyRead(out, row.kind, text, false);
  }

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
