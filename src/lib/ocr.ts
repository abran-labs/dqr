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
}

// Shared worker instance. eng.traineddata is served from /public for offline use.
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", undefined, {
      logger: () => {},
      langPath: "/",
    });
  }
  return workerPromise;
}

interface ScaledImage {
  readonly canvas: HTMLCanvasElement;
  readonly url: string;
}

async function loadAndScale(
  imageSource: File | Blob | string,
): Promise<ScaledImage | null> {
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

  // Upscale to at least 1200px wide — Tesseract accuracy degrades badly on low-res inputs.
  const SCALE = Math.min(4, Math.max(1, Math.ceil(1200 / img.width)));

  const canvas = document.createElement("canvas");
  canvas.width = img.width * SCALE;
  canvas.height = img.height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, url };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, url };
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

// Returns upscaled + thresholded image for the inverted pass.
async function preprocessImage(
  imageSource: File | Blob | string,
): Promise<string | HTMLCanvasElement> {
  const result = await loadAndScale(imageSource);
  if (!result) {
    return typeof imageSource === "string"
      ? imageSource
      : URL.createObjectURL(imageSource);
  }
  const { canvas, url } = result;

  const ctx = canvas.getContext("2d");
  if (!ctx) return url;

  // The dark tooltip with bright text is hard for Tesseract; invert it so the
  // background is white and the text black.
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  } catch {
    // If getImageData fails (e.g. CORS), fall back to the original.
    return url;
  }
}

export async function scanTooltip(
  imageSource: File | Blob | string,
): Promise<TooltipScan> {
  const worker = await getWorker();

  const [upscaledInput, processedInput] = await Promise.all([
    upscaleImage(imageSource),
    preprocessImage(imageSource),
  ]);

  const [normalRun, processedRun] = await Promise.all([
    worker.recognize(upscaledInput),
    worker.recognize(processedInput),
  ]);

  return {
    rawText: normalRun.data.text.trim(),
    processedText: processedRun.data.text.trim(),
  };
}
