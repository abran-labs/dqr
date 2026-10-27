import { thresholdXpPixels } from "./xp-pixels";

export async function prepareXpCanvas(source: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, 1600 / bitmap.width);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    bitmap.close();
    throw new Error("Couldn't prepare the screenshot.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  thresholdXpPixels(image.data);
  context.putImageData(image, 0, 0);
  return canvas;
}
