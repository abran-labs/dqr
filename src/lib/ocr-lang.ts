/*
  In-game language for tooltip OCR. English is bundled at /eng.traineddata;
  every other pack is fetched by tesseract.js on first use (CDN, then IndexedDB).
*/

export const DEFAULT_OCR_LANG = "eng";

export const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "chi_tra", label: "Chinese (Traditional)" },
  { code: "nld", label: "Dutch" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "ind", label: "Indonesian" },
  { code: "ita", label: "Italian" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "pol", label: "Polish" },
  { code: "por", label: "Portuguese" },
  { code: "rus", label: "Russian" },
  { code: "spa", label: "Spanish" },
  { code: "tha", label: "Thai" },
  { code: "tur", label: "Turkish" },
  { code: "vie", label: "Vietnamese" },
] as const;

export type OcrLang = (typeof OCR_LANGUAGES)[number]["code"];

const STORAGE_KEY = "dqr-in-game-language";

export function isOcrLang(value: string): value is OcrLang {
  return OCR_LANGUAGES.some((lang) => lang.code === value);
}

export function parseOcrLang(value: unknown): OcrLang {
  return typeof value === "string" && isOcrLang(value) ? value : DEFAULT_OCR_LANG;
}

export function readOcrLang(): OcrLang {
  if (typeof window === "undefined") return DEFAULT_OCR_LANG;
  try {
    return parseOcrLang(window.localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    if (err instanceof DOMException) return DEFAULT_OCR_LANG;
    throw err;
  }
}

export function writeOcrLang(lang: OcrLang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch (err) {
    if (err instanceof DOMException) return;
    throw err;
  }
}
