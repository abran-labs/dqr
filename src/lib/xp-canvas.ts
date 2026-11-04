import { thresholdXpGreenPixels, thresholdXpPixels } from "./xp-pixels";

export interface XpCanvases {
  /** Luminance threshold — sharpest read on normal-size HUD crops. */
  readonly primary: HTMLCanvasElement;
  /** Green-channel threshold — rescues small crops where decimal points vanish. */
  readonly fallback: HTMLCanvasElement;
}

/** Nearest-neighbour keeps 1-2 px decimal points intact; smooth scaling blurs them away. */
function upscale(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;
  const context = canvas.getContext("2d");
  if (context === null) return source;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

interface Base {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

function drawBase(bitmap: ImageBitmap): Base | null {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(bitmap, 0, 0);
  return { canvas, context };
}

function thresholdBase(base: Base, threshold: (pixels: Uint8ClampedArray) => void): void {
  const image = base.context.getImageData(0, 0, base.canvas.width, base.canvas.height);
  threshold(image.data);
  base.context.putImageData(image, 0, 0);
}

export async function prepareXpCanvases(source: File | Blob): Promise<XpCanvases> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.max(1, Math.min(4, Math.round(1600 / bitmap.width)));
  const primary = drawBase(bitmap);
  const fallback = drawBase(bitmap);
  bitmap.close();
  if (primary === null || fallback === null) throw new Error("Couldn't prepare the screenshot.");
  thresholdBase(primary, thresholdXpPixels);
  thresholdBase(fallback, thresholdXpGreenPixels);
  return { fallback: upscale(fallback.canvas, scale), primary: upscale(primary.canvas, scale) };
}
