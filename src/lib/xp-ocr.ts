import { getOcrWorker, invalidateWorker } from "./ocr";
import { prepareXpCanvases } from "./xp-canvas";
import { parseXpText } from "./xp-extract";

export class XpOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XpOcrError";
  }
}

/** 2 = usable read with a level, 1 = numbers but no level, 0 = unreadable. */
function rank(text: string): number {
  const result = parseXpText(text);
  if (result.kind !== "ok") return 0;
  return result.level === null ? 1 : 2;
}

/**
  Reads the EXP bar. Small crops lose their decimal points under the sharp
  luminance pass, so when that read cannot produce a level the green-channel
  pass runs too; the caller tries each text in order.
*/
export async function scanXpScreenshot(imageSource: File | Blob): Promise<readonly string[]> {
  try {
    const prepared = await prepareXpCanvases(imageSource);
    const worker = await getOcrWorker();
    const primary = (await worker.recognize(prepared.primary)).data.text.trim();
    const primaryRank = rank(primary);
    if (primaryRank === 2) return [primary];
    const fallback = (await worker.recognize(prepared.fallback)).data.text.trim();
    const fallbackRank = rank(fallback);
    if (primary === "" && fallback === "") throw new XpOcrError("Couldn't read that screenshot.");
    return fallbackRank > primaryRank ? [fallback, primary] : [primary, fallback];
  } catch (error) {
    invalidateWorker();
    if (error instanceof XpOcrError) throw error;
    throw new XpOcrError("Couldn't read that screenshot; enter your level and EXP manually.");
  }
}
