import Tesseract from "tesseract.js";

import type { Rarity } from "./dqr-items";
import { asDataUrl, prepareTooltipCanvases } from "./ocr-canvas";
import { readTooltipRows } from "./ocr-rows";

/*
  Client-side OCR for Dungeon Quest Reborn tooltips.

  Structure-first (`ocr-rows.ts`): find the card, split it into text rows,
  identify each row by the colour DQR renders it in, then read only that row's
  value as digits — via fixed-font template matching, falling back to Tesseract
  when glyph cutting is ambiguous.

  Measured on the labeled corpus (bench/): 96.8% field accuracy, 2 wrong values,
  versus 75.9% / 11 wrong for the previous whole-card text pipeline.

  English only. Tooltip VALUES are Arabic digits in every locale, so the
  structured reader works regardless of the in-game language; only the item
  name needs English, and a missed name falls back to the numeric fingerprint
  in `item-guess.ts`.

  See docs/Info/OCR-Input.md.
*/

export interface TooltipScan {
  /** Text from the upscaled color pass. */
  readonly rawText: string;
  /** Text from the inverted/thresholded pass. */
  readonly processedText: string;
  /** PNG data URL of the upscaled color image the OCR actually read — logged
   *  with the stats API so past reads can be re-verified later. Null if a
   *  canvas could not be produced. */
  readonly imageDataUrl: string | null;
  /** Card-chrome rarity from pixel color. Null when the image has no readable chrome. */
  readonly rarity: Rarity | null;
  /** White-glyph pass (item name + REQ Lvl). Empty when the plate could not be built. */
  readonly nameText: string;

  /* Structured reads from `ocr-rows.ts`. `undefined` means this scan came
     from a caller that did not run the row reader (tests, legacy fixtures),
     so `ocr-extract.ts` falls back to parsing the text passes. `null` means
     the reader ran and genuinely found nothing. */
  readonly physical?: number | null;
  readonly spell?: number | null;
  readonly health?: number | null;
  readonly upsDone?: number | null;
  readonly upsTotal?: number | null;
  /** Mean per-row recogniser confidence, 0-100. */
  readonly confidence?: number | null;
}

// Shared worker. English uses the uncompressed /eng.traineddata (gzip off —
// tesseract.js would otherwise request a .gz that 404s and kill the worker).
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (workerPromise !== null) return workerPromise;
  workerPromise = Tesseract.createWorker("eng", undefined, {
    gzip: false,
    langPath: "/",
    logger: () => {},
  });
  return workerPromise;
}

/** Drop the shared worker so the next scan builds a fresh one. */
export function invalidateWorker(): void {
  const previous = workerPromise;
  workerPromise = null;
  if (previous === null) return;
  void previous.then(
    (worker) => worker.terminate(),
    (err: unknown) => {
      if (err instanceof Error) return;
      throw err;
    },
  );
}

export async function scanTooltip(imageSource: File | Blob | string): Promise<TooltipScan> {
  const run = async (): Promise<TooltipScan> => {
    const worker = await getWorker();

    const prepared = await prepareTooltipCanvases(imageSource);

    // Structured read. Falls back to the legacy whole-card text pass only
    // when the image could not be decoded to pixels (cross-origin canvas).
    if (prepared.pixels === null) {
      const normalRun = await worker.recognize(prepared.color);
      const rawText = normalRun.data.text.trim();
      if (rawText === "") throw new Error("No item data found in image.");
      return {
        imageDataUrl: asDataUrl(prepared.color),
        nameText: "",
        processedText: rawText,
        rarity: prepared.rarity,
        rawText,
      };
    }

    const reads = await readTooltipRows(worker, prepared.pixels);
    const found =
      reads.physical !== null ||
      reads.spell !== null ||
      reads.health !== null ||
      reads.upsTotal !== null;
    if (!found && reads.nameText === "") {
      throw new Error("No item data found in image.");
    }

    return {
      confidence: reads.confidence,
      health: reads.health,
      imageDataUrl: asDataUrl(prepared.color),
      nameText: reads.nameText,
      physical: reads.physical,
      // Kept for the stats log and for `ocr-field.ts` bare-number crops.
      processedText: reads.nameText,
      rarity: prepared.rarity,
      rawText: reads.nameText,
      spell: reads.spell,
      upsDone: reads.upsDone,
      upsTotal: reads.upsTotal,
    };
  };

  const TIMEOUT_MS = 90_000;
  try {
    return await Promise.race([
      run(),
      new Promise<TooltipScan>((_, reject) => {
        setTimeout(() => reject(new Error("OCR timed out.")), TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    invalidateWorker();
    throw err;
  }
}
