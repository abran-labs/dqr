import { getOcrWorker, invalidateWorker } from "./ocr";
import { prepareXpCanvas } from "./xp-canvas";

export class XpOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XpOcrError";
  }
}

export async function scanXpScreenshot(imageSource: File | Blob): Promise<string> {
  try {
    const prepared = await prepareXpCanvas(imageSource);
    const worker = await getOcrWorker();
    const result = await worker.recognize(prepared);
    const text = result.data.text.trim();
    if (text === "") throw new XpOcrError("Couldn't read that screenshot.");
    return text;
  } catch (error) {
    invalidateWorker();
    if (error instanceof XpOcrError) throw error;
    throw new XpOcrError("Couldn't read that screenshot; enter your level and EXP manually.");
  }
}
