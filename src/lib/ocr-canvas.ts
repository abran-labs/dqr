/*
  Canvas prep for tooltip OCR: upscale, invert/threshold, white name plate,
  rarity chrome. See docs/Info/OCR-Input.md.
*/

import type { Rarity } from "./dqr-items";
import { detectRarityFromPixels } from "./rarity-color";

type ImageSource = File | Blob | string;

interface ScaledImage {
  readonly canvas: HTMLCanvasElement;
  readonly url: string;
}

export async function loadImage(imageSource: ImageSource): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined" || !document) return null;

  const img = new Image();
  img.crossOrigin = "Anonymous";
  const url = imageSource instanceof Blob ? URL.createObjectURL(imageSource) : imageSource;

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

function nearestUpscale(small: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return small;
  const big = document.createElement("canvas");
  big.width = small.width * scale;
  big.height = small.height * scale;
  const bctx = big.getContext("2d");
  if (!bctx) return small;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

async function loadAndScale(imageSource: ImageSource): Promise<ScaledImage | null> {
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

function blobUrl(imageSource: ImageSource): string {
  return typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource);
}

export async function upscaleImage(imageSource: ImageSource): Promise<string | HTMLCanvasElement> {
  const result = await loadAndScale(imageSource);
  if (result) return result.canvas;
  return blobUrl(imageSource);
}

export async function preprocessImage(imageSource: ImageSource): Promise<string | HTMLCanvasElement> {
  const img = await loadImage(imageSource);
  if (!img) return blobUrl(imageSource);

  try {
    const small = document.createElement("canvas");
    small.width = img.width;
    small.height = img.height;
    const sctx = small.getContext("2d");
    if (!sctx) return URL.createObjectURL(imageSource instanceof Blob ? imageSource : new Blob());
    sctx.drawImage(img, 0, 0);

    const imgData = sctx.getImageData(0, 0, small.width, small.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const val = (r + g + b) / 3 > 80 ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    sctx.putImageData(imgData, 0, 0);
    return nearestUpscale(small, scaleFor(img));
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    const fallback = await loadAndScale(imageSource);
    return fallback ? fallback.canvas : blobUrl(imageSource);
  }
}

const WHITE_MIN = 180;
const NAME_BAND = 0.28;
const NAME_PAD = 16;

/** Near-white glyphs only (item name + REQ Lvl). Null if the plate cannot be built. */
export async function namePlateImage(imageSource: ImageSource): Promise<HTMLCanvasElement | null> {
  const img = await loadImage(imageSource);
  if (!img) return null;
  const band = Math.max(32, Math.floor(img.height * NAME_BAND));
  const small = document.createElement("canvas");
  small.width = img.width + NAME_PAD * 2;
  small.height = band + NAME_PAD * 2;
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  sctx.fillStyle = "#000000";
  sctx.fillRect(0, 0, small.width, small.height);
  sctx.drawImage(img, 0, 0, img.width, band, NAME_PAD, NAME_PAD, img.width, band);
  try {
    const imgData = sctx.getImageData(0, 0, small.width, small.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const val = Math.min(r, g, b) > WHITE_MIN ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    sctx.putImageData(imgData, 0, 0);
  } catch (err) {
    if (err instanceof DOMException) return null;
    throw err;
  }
  return nearestUpscale(small, scaleFor(img));
}

export async function detectRarity(imageSource: ImageSource): Promise<Rarity | null> {
  const img = await loadImage(imageSource);
  if (!img) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  try {
    const { data, height, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectRarityFromPixels({ data, height, width });
  } catch (err) {
    if (err instanceof DOMException) return null;
    throw err;
  }
}

export function asDataUrl(source: string | HTMLCanvasElement): string | null {
  if (source instanceof HTMLCanvasElement) return source.toDataURL("image/png");
  return source.startsWith("data:") ? source : null;
}
