/** Isolate bright HUD glyphs from saturated HP/EXP backgrounds. */
export function thresholdXpPixels(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const value = luminance > 130 ? 255 : 0;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }
}

/**
  Green channel only: the EXP bar is magenta (green ≈ 0) while its white text is
  green ≈ 255, so faint decimal points survive when luminance averaging would
  bury them in the bar's bright gradient.
*/
export function thresholdXpGreenPixels(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const value = (pixels[index + 1] ?? 0) > 100 ? 255 : 0;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }
}
