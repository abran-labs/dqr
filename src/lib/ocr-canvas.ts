/*
  Canvas adapter for shared tooltip preprocess (`ocr-pixels.ts`).
*/

import type { Rarity } from "./dqr-items";
import { prepareTooltipPasses } from "./ocr-pixels";
import { detectRarityFromPixels, type PixelBuffer } from "./rarity-color";

type ImageSource = File | Blob | string;

export type PreparedTooltip = {
  readonly color: string | HTMLCanvasElement;
  readonly namePlate: HTMLCanvasElement | null;
  readonly rarity: Rarity | null;
  readonly threshold: string | HTMLCanvasElement;
};

async function loadImage(imageSource: ImageSource): Promise<HTMLImageElement | null> {
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

function blobUrl(imageSource: ImageSource): string {
  return typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource);
}

async function nativeBuffer(imageSource: ImageSource): Promise<PixelBuffer | null> {
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
    return { data, height, width };
  } catch (err) {
    if (err instanceof DOMException) return null;
    throw err;
  }
}

function bufferToCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = buf.width;
  canvas.height = buf.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const imageData = ctx.createImageData(buf.width, buf.height);
  imageData.data.set(buf.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function prepareTooltipCanvases(imageSource: ImageSource): Promise<PreparedTooltip> {
  const native = await nativeBuffer(imageSource);
  if (!native) {
    const url = blobUrl(imageSource);
    return { color: url, namePlate: null, rarity: null, threshold: url };
  }
  const passes = prepareTooltipPasses(native);
  return {
    color: bufferToCanvas(passes.color),
    namePlate: passes.namePlate === null ? null : bufferToCanvas(passes.namePlate),
    rarity: detectRarityFromPixels(native),
    threshold: bufferToCanvas(passes.threshold),
  };
}

export function asDataUrl(source: string | HTMLCanvasElement): string | null {
  if (source instanceof HTMLCanvasElement) return source.toDataURL("image/png");
  return source.startsWith("data:") ? source : null;
}
