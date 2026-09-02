export type ClipboardImageItem = {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
};

export type ClipboardReadSource = {
  readonly read: () => Promise<readonly ClipboardImageItem[]>;
};

export type CssSupports = (property: string, value: string) => boolean;

/** Gecko (Firefox, Zen) — `clipboard.read()` shows a Paste chip; skip it. */
export function isGeckoEngine(supports: CssSupports): boolean {
  return supports("-moz-appearance", "none");
}

function isExpectedClipboardFailure(error: unknown): boolean {
  return error instanceof DOMException || error instanceof TypeError;
}

export async function readClipboardImage(
  clipboard: ClipboardReadSource | null | undefined,
): Promise<Blob | null> {
  if (clipboard == null) return null;
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType === undefined) continue;
      return item.getType(imageType);
    }
    return null;
  } catch (error) {
    if (isExpectedClipboardFailure(error)) return null;
    throw error;
  }
}
