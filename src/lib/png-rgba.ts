/*
  8-bit RGB/RGBA PNG, no interlace — tooltip screenshots and OCR fixtures.
*/

import { deflateSync, inflateSync } from "node:zlib";

import type { PixelBuffer } from "./rarity-color";

export function decodePngRgba(bytes: Uint8Array): PixelBuffer {
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new Error("not a PNG");
  }
  let width = 0;
  let height = 0;
  let color = 0;
  let bit = 0;
  let interlace = 0;
  const idatParts: Uint8Array[] = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = readU32(bytes, pos);
    const type = String.fromCharCode(
      bytes[pos + 4] ?? 0,
      bytes[pos + 5] ?? 0,
      bytes[pos + 6] ?? 0,
      bytes[pos + 7] ?? 0,
    );
    const start = pos + 8;
    const chunk = bytes.subarray(start, start + length);
    pos = start + length + 4;
    if (type === "IHDR") {
      width = readU32(chunk, 0);
      height = readU32(chunk, 4);
      bit = chunk[8] ?? 0;
      color = chunk[9] ?? 0;
      interlace = chunk[12] ?? 0;
    } else if (type === "IDAT") {
      idatParts.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bit !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) {
    throw new Error(`unsupported PNG ihdr bit=${bit} color=${color} interlace=${interlace}`);
  }
  const raw = inflateSync(concat(idatParts));
  const bpp = color === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  let src = 0;
  let prev: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[src] ?? 0;
    src += 1;
    const row = raw.subarray(src, src + stride);
    src += stride;
    const recon = unfilter(filter, row, prev, bpp);
    prev = recon;
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      const o = (y * width + x) * 4;
      rgba[o] = recon[i] ?? 0;
      rgba[o + 1] = recon[i + 1] ?? 0;
      rgba[o + 2] = recon[i + 2] ?? 0;
      rgba[o + 3] = color === 6 ? (recon[i + 3] ?? 0) : 255;
    }
  }
  return { data: rgba, height, width };
}

export function encodePngRgba(image: PixelBuffer): Uint8Array {
  const { data, height, width } = image;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    raw[o] = 0;
    raw.set(data.subarray(y * stride, y * stride + stride), o + 1);
  }
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    const mix = CRC_TABLE[(c ^ b) & 255];
    if (mix === undefined) throw new Error("crc table");
    c = mix ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  out.set(body, 4);
  writeU32(out, 8 + data.length, crc32(body));
  return out;
}

function unfilter(filter: number, row: Uint8Array, prev: Uint8Array, bpp: number): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let x = 0; x < row.length; x++) {
    const raw = row[x] ?? 0;
    const a = x >= bpp ? (out[x - bpp] ?? 0) : 0;
    const b = prev[x] ?? 0;
    const c = x >= bpp ? (prev[x - bpp] ?? 0) : 0;
    let val = raw;
    if (filter === 1) val = (raw + a) & 255;
    else if (filter === 2) val = (raw + b) & 255;
    else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 255;
    else if (filter === 4) val = (raw + paeth(a, b, c)) & 255;
    else if (filter !== 0) throw new Error(`png filter ${filter}`);
    out[x] = val;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
