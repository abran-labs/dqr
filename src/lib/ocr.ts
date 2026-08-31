import Tesseract from "tesseract.js";

/*
  Generic client-side OCR infrastructure for Dungeon Quest Reborn tooltips.

  Runs two recognition passes per image, mirroring what proved necessary for
  dark game UIs in the AbyssFishLog pipeline this project was seeded from:

    1. Upscaled color image — better for names and colored text.
    2. Upscaled + inverted/thresholded image — better for numbers.

  Tooltip field extraction (name, phys/spell/health, upgrades, level) is
  layered on top of this in the calculator phase. See docs/Info/OCR-Input.md.
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
}

// Shared worker instance. eng.traineddata is served uncompressed from
// /public — tesseract.js defaults to fetching a .gz variant that 404s and
// leaves the worker dead, so gzip is disabled explicitly.
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", undefined, {
      gzip: false,
      langPath: "/",
      logger: () => {},
    });
  }
  return workerPromise;
}

/** Drop the shared worker so the next scan builds a fresh one. */
export function invalidateWorker(): void {
  workerPromise = null;
}

interface ScaledImage {
  readonly canvas: HTMLCanvasElement;
  readonly url: string;
}

async function loadAndScale(
  imageSource: File | Blob | string,
): Promise<ScaledImage | null> {
  const img = await loadImage(imageSource);
  if (!img) return null;

  const canvas = document.createElement("canvas");
  canvas.width = img.width * scaleFor(img);
  canvas.height = img.height * scaleFor(img);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, url: img.src };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, url: img.src };
}

async function loadImage(
  imageSource: File | Blob | string,
): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined" || !document) return null;

  const img = new Image();
  img.crossOrigin = "Anonymous";
  const url =
    imageSource instanceof Blob ? URL.createObjectURL(imageSource) : imageSource;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  return img;
}

/** Upscale to at least 1200px wide — Tesseract accuracy degrades on low-res inputs. */
function scaleFor(img: HTMLImageElement): number {
  return Math.min(4, Math.max(1, Math.ceil(1200 / img.width)));
}

// Returns upscaled image (no threshold) — mirrors what the user sees when they zoom in.
async function upscaleImage(
  imageSource: File | Blob | string,
): Promise<string | HTMLCanvasElement> {
  const result = await loadAndScale(imageSource);
  if (result) return result.canvas;
  // No DOM (should not happen — this module only runs in the browser island).
  return typeof imageSource === "string"
    ? imageSource
    : URL.createObjectURL(imageSource);
}

// Returns upscaled + thresholded image for the inverted pass. Thresholding
// happens at NATIVE resolution, then the binary image is upscaled without
// smoothing: thresholding after the upscale merges the antialiased strokes
// of thin fonts (the white item name) into unreadable blobs. Empirically
// verified on assets/1.png — only threshold-then-upscale keeps the name.
async function preprocessImage(
  imageSource: File | Blob | string,
): Promise<string | HTMLCanvasElement> {
  const img = await loadImage(imageSource);
  if (!img) {
    return typeof imageSource === "string"
      ? imageSource
      : URL.createObjectURL(imageSource);
  }

  try {
    const small = document.createElement("canvas");
    small.width = img.width;
    small.height = img.height;
    const sctx = small.getContext("2d");
    if (!sctx) return URL.createObjectURL(imageSource instanceof Blob ? imageSource : new Blob());
    sctx.drawImage(img, 0, 0);

    // The dark tooltip with bright text is hard for Tesseract; invert it so
    // the background is white and the text black.
    const imgData = sctx.getImageData(0, 0, small.width, small.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const avg = (r + g + b) / 3;
      const val = avg > 80 ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    sctx.putImageData(imgData, 0, 0);

    const scale = scaleFor(img);
    if (scale === 1) return small;

    const big = document.createElement("canvas");
    big.width = small.width * scale;
    big.height = small.height * scale;
    const bctx = big.getContext("2d");
    if (!bctx) return small;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(small, 0, 0, big.width, big.height);
    return big;
  } catch {
    // If getImageData fails (e.g. CORS), fall back to the upscaled color image.
    const fallback = await loadAndScale(imageSource);
    return fallback ? fallback.canvas : URL.createObjectURL(imageSource instanceof Blob ? imageSource : new Blob());
  }
}

const asDataUrl = (source: string | HTMLCanvasElement): string | null => {
  if (source instanceof HTMLCanvasElement) return source.toDataURL("image/png");
  return source.startsWith("data:") ? source : null;
};

export async function scanTooltip(
  imageSource: File | Blob | string,
): Promise<TooltipScan> {
  const run = async (): Promise<TooltipScan> => {
    const worker = await getWorker();

    const [upscaledInput, processedInput] = await Promise.all([
      upscaleImage(imageSource),
      preprocessImage(imageSource),
    ]);

    // One job at a time — tesseract.js workers deadlock when two recognize
    // calls race on the same instance (the "stuck on scanning" bug).
    const normalRun = await worker.recognize(upscaledInput);
    const processedRun = await worker.recognize(processedInput);

    const rawText = normalRun.data.text.trim();
    const processedText = processedRun.data.text.trim();
    if (rawText === "" && processedText === "") {
      // Both passes empty — not a tooltip (or unreadable). Treat as invalid.
      throw new Error("No item data found in image.");
    }

    return {
      imageDataUrl: asDataUrl(upscaledInput),
      processedText,
      rawText,
    };
  };

  // A dead worker can leave recognize pending forever — never spin eternally.
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
