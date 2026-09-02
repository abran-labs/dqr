/*
  Field-targeted paste: an image pasted (or dropped) while a single
  calculator input has focus. A full tooltip contributes its matching
  line value (docs/Info/OCR-Input.md); a zoomed-in crop that is nothing
  but digits contributes that number as-is. Nothing here is
  range-checked — paste is not autofill, and the form's live validation
  flags implausible reads.
*/

import type { DqrItem } from "./dqr-items";
import { extractTooltip, type ExtractedTooltip } from "./ocr-extract";
import type { TooltipScan } from "./ocr";
import { pickTooltipStat } from "./ocr-stat";

export type PasteField = "upsTotal" | "upsDone" | "stat" | "spell" | "health";

export type FieldPasteRead = {
  readonly extract: ExtractedTooltip;
  /** Value for the pasted-into field. Null when nothing plausible was read. */
  readonly value: number | null;
  /** done/total when the crop held the upgrade pair ("33/331"). */
  readonly done: number | null;
  readonly total: number | null;
};

/** Digit runs after group separators are dropped; 16+ digits is OCR noise. */
export function numberRuns(text: string): readonly number[] {
  const stripped = text.trim().replace(/[,.]/g, "");
  if (stripped === "" || !/^\d[\d\s/]*$/.test(stripped)) return [];
  const runs = stripped.split(/[\s/]+/);
  const values: number[] = [];
  for (const run of runs) {
    if (run === "") continue;
    const value = Number(run);
    if (!Number.isSafeInteger(value)) return [];
    values.push(value);
  }
  return values;
}

function readRuns(scan: TooltipScan): readonly number[] {
  const values = [...numberRuns(scan.rawText), ...numberRuns(scan.processedText)];
  // Both passes read the same bare number — one value, not a pair.
  return values.filter((value, i) => i === 0 || value !== values[i - 1]);
}

export function readFieldPaste(
  field: PasteField,
  scan: TooltipScan,
  item: DqrItem | null,
): FieldPasteRead {
  const extract = extractTooltip(scan);
  // A true number-only crop has no letters in either pass — the runs then
  // ARE the read; tooltip text (letters present) goes through labels only.
  const bare = /[a-z]/i.test(`${scan.rawText}\n${scan.processedText}`) ? null : readRuns(scan);

  if (field === "upsDone" || field === "upsTotal") {
    let done = extract.upsDone;
    let total = extract.upsTotal;
    if (done === null && total === null && bare !== null) {
      if (bare.length === 1) {
        // One number alone: ambiguous between done and total — aim at the
        // pasted field, leave the sibling for the user.
        if (field === "upsDone") done = bare[0] ?? null;
        else total = bare[0] ?? null;
      } else if (bare.length === 2) {
        done = bare[0] ?? null;
        total = bare[1] ?? null;
      }
    }
    return { done, extract, total, value: field === "upsDone" ? done : total };
  }

  let value: number | null;
  switch (field) {
    case "health":
      value = extract.health;
      break;
    case "spell":
      value = extract.spell;
      break;
    case "stat":
      value =
        (item === null ? null : pickTooltipStat(extract, item).value) ??
        extract.physical ??
        extract.spell ??
        extract.health;
      break;
  }
  if (value === null && bare !== null && bare.length === 1) value = bare[0] ?? null;
  return { done: null, extract, total: null, value };
}
