import { useEffect, useState } from "react";

import {
  DEFAULT_OCR_LANG,
  OCR_LANGUAGES,
  parseOcrLang,
  readOcrLang,
  writeOcrLang,
  type OcrLang,
} from "@/lib/ocr-lang";

/*
  Header control for tooltip OCR language. Writes localStorage only —
  the OCR worker reads it on the next scan and does not load here
  (keeps tesseract.js out of the layout bundle).
*/

export function InGameLanguageSelect() {
  const [lang, setLang] = useState<OcrLang>(DEFAULT_OCR_LANG);

  useEffect(() => {
    setLang(readOcrLang());
  }, []);

  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground lg:inline">
        In-game language
      </span>
      <select
        aria-label="In-game language"
        className="h-8 max-w-[11rem] rounded-sm border border-border bg-transparent px-2 text-xs text-foreground shadow-none outline-none transition-colors focus-visible:border-border/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => {
          const next = parseOcrLang(event.target.value);
          writeOcrLang(next);
          setLang(next);
        }}
        value={lang}
      >
        {OCR_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
