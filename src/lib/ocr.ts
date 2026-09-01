import Tesseract from "tesseract.js";

import type { Rarity } from "./dqr-items";
import { asDataUrl, prepareTooltipCanvases } from "./ocr-canvas";
import { DEFAULT_OCR_LANG, readOcrLang, type OcrLang } from "./ocr-lang";

/*
  Client-side OCR for Dungeon Quest Reborn tooltips.

  Three sequential Tesseract passes (one worker — parallel recognize deadlocks):
    1. Mitchell-upscaled color — numbers and some labels (`ocr-pixels.ts`).
    2. Native-threshold then nearest upscale — numbers; names on high-contrast cards.
    3. White name plate (top band) — white title on purple Epic cards (assets/4.png).

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
}

// Shared worker. English uses uncompressed /eng.traineddata (gzip off —
// tesseract.js would otherwise request a .gz that 404s and kill the worker).
// Other languages download from the tesseract.js CDN on first use.
let workerPromise: Promise<Tesseract.Worker> | null = null;
let workerLang: OcrLang | null = null;

async function createLangWorker(
  lang: OcrLang,
  previous: Promise<Tesseract.Worker> | null,
): Promise<Tesseract.Worker> {
  if (previous !== null) {
    let old: Tesseract.Worker | null = null;
    try {
      old = await previous;
    } catch (err) {
      if (!(err instanceof Error)) throw err;
    }
    if (old !== null) await old.terminate();
  }
  const bundledEnglish = lang === DEFAULT_OCR_LANG;
  return Tesseract.createWorker(lang, undefined, {
    gzip: !bundledEnglish,
    logger: () => {},
    ...(bundledEnglish ? { langPath: "/" } : {}),
  });
}

async function getWorker(): Promise<Tesseract.Worker> {
  const lang = readOcrLang();
  if (workerPromise !== null && workerLang === lang) return workerPromise;
  workerPromise = createLangWorker(lang, workerPromise);
  workerLang = lang;
  return workerPromise;
}

/** Drop the shared worker so the next scan builds a fresh one. */
export function invalidateWorker(): void {
  const previous = workerPromise;
  workerPromise = null;
  workerLang = null;
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

    const normalRun = await worker.recognize(prepared.color);
    const processedRun = await worker.recognize(prepared.threshold);
    const nameRun = prepared.namePlate === null ? null : await worker.recognize(prepared.namePlate);

    const rawText = normalRun.data.text.trim();
    const processedText = processedRun.data.text.trim();
    const nameText = nameRun?.data.text.trim() ?? "";
    if (rawText === "" && processedText === "") {
      throw new Error("No item data found in image.");
    }

    return {
      imageDataUrl: asDataUrl(prepared.color),
      nameText,
      processedText,
      rarity: prepared.rarity,
      rawText,
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
