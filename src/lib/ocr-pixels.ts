/*
  Shared tooltip preprocess — browser canvas and bun tests call this.
  Color pass is Mitchell cubic (not the browser's bilinear "high" smooth,
  which inserts digits). Threshold + name plate stay nearest.
*/

import type { PixelBuffer } from "./rarity-color";

const THRESHOLD = 80;
const WHITE_MIN = 180;
const NAME_BAND = 0.28;
const NAME_PAD = 16;
const MIN_WIDTH = 1200;
const MAX_SCALE = 4;

export type TooltipPasses = {
  readonly color: PixelBuffer;
  readonly namePlate: PixelBuffer | null;
  readonly threshold: PixelBuffer;
};

export function scaleFor(width: number): number {
  if (width <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(1, Math.ceil(MIN_WIDTH / width)));
}

export function prepareTooltipPasses(src: PixelBuffer): TooltipPasses {
  const scale = scaleFor(src.width);
  return {
    color: mitchellUpscale(src, scale),
    namePlate: namePlateBuffer(src, scale),
    threshold: nearestUpscale(thresholdInvert(src), scale),
  };
}

export function nearestUpscale(src: PixelBuffer, scale: number): PixelBuffer {
  if (scale <= 1) return src;
  const width = src.width * scale;
  const height = src.height * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / scale);
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = src.data[si] ?? 0;
      data[di + 1] = src.data[si + 1] ?? 0;
      data[di + 2] = src.data[si + 2] ?? 0;
      data[di + 3] = src.data[si + 3] ?? 255;
    }
  }
  return { data, height, width };
}

export function mitchellUpscale(src: PixelBuffer, scale: number): PixelBuffer {
  if (scale <= 1) return src;
  return resampleY(resampleX(src, src.width * scale), src.height * scale);
}

function thresholdInvert(src: PixelBuffer): PixelBuffer {
  const data = new Uint8Array(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i] ?? 0;
    const g = src.data[i + 1] ?? 0;
    const b = src.data[i + 2] ?? 0;
    const val = (r + g + b) / 3 > THRESHOLD ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  return { data, height: src.height, width: src.width };
}

function namePlateBuffer(src: PixelBuffer, scale: number): PixelBuffer | null {
  const band = Math.max(32, Math.floor(src.height * NAME_BAND));
  if (band <= 0 || src.width <= 0) return null;
  const width = src.width + NAME_PAD * 2;
  const height = band + NAME_PAD * 2;
  const data = new Uint8Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((y + NAME_PAD) * width + (x + NAME_PAD)) * 4;
      const r = src.data[si] ?? 0;
      const g = src.data[si + 1] ?? 0;
      const b = src.data[si + 2] ?? 0;
      const val = Math.min(r, g, b) > WHITE_MIN ? 0 : 255;
      data[di] = val;
      data[di + 1] = val;
      data[di + 2] = val;
      data[di + 3] = 255;
    }
  }
  return nearestUpscale({ data, height, width }, scale);
}

const MITCHELL_B = 1 / 3;
const MITCHELL_C = 1 / 3;

function mitchell(x: number): number {
  const ax = Math.abs(x);
  const b = MITCHELL_B;
  const c = MITCHELL_C;
  if (ax < 1) {
    return ((12 - 9 * b - 6 * c) * ax * ax * ax + (-18 + 12 * b + 6 * c) * ax * ax + (6 - 2 * b)) / 6;
  }
  if (ax < 2) {
    return ((-b - 6 * c) * ax * ax * ax + (6 * b + 30 * c) * ax * ax + (-12 * b - 48 * c) * ax + (8 * b + 24 * c)) / 6;
  }
  return 0;
}

function clampByte(value: number): number {
  const v = Math.round(value);
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

function resampleX(src: PixelBuffer, dstW: number): PixelBuffer {
  const { height, width } = src;
  const data = new Uint8Array(dstW * height * 4);
  const scale = dstW / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = x / scale;
      const di = (y * dstW + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        data[di + ch] = clampByte(cubicAt(src, sx, y, width, height, true, ch));
      }
    }
  }
  return { data, height, width: dstW };
}

function resampleY(src: PixelBuffer, dstH: number): PixelBuffer {
  const { height, width } = src;
  const data = new Uint8Array(width * dstH * 4);
  const scale = dstH / height;
  for (let y = 0; y < dstH; y++) {
    const sy = y / scale;
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        data[di + ch] = clampByte(cubicAt(src, x, sy, width, height, false, ch));
      }
    }
  }
  return { data, height: dstH, width };
}

function cubicAt(
  src: PixelBuffer,
  fx: number,
  fy: number,
  maxX: number,
  maxY: number,
  horizontal: boolean,
  ch: number,
): number {
  const t = horizontal ? fx : fy;
  const base = Math.floor(t);
  let num = 0;
  let den = 0;
  for (let i = base - 1; i <= base + 2; i++) {
    const w = mitchell(t - i);
    if (w === 0) continue;
    const ix = horizontal ? (i < 0 ? 0 : i >= maxX ? maxX - 1 : i) : fx;
    const iy = horizontal ? fy : i < 0 ? 0 : i >= maxY ? maxY - 1 : i;
    const o = (iy * src.width + ix) * 4 + ch;
    num += (src.data[o] ?? 0) * w;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}
