import { formatCompact, formatCompactTruncated, MAX_LEVEL, MIN_LEVEL, parseAmountInput, xpForLevel } from "./xp-math";

export type XpTextResult =
  | { readonly kind: "ok"; readonly level: number | null; readonly currentXp: string; readonly warning: string | null }
  | { readonly kind: "error"; readonly message: string };

interface Amount {
  /** Parsed value. */
  readonly value: number;
  /** Cleaned text safe to drop into the input — repaired when OCR swapped glyphs. */
  readonly text: string;
}

interface AmountPair {
  readonly current: Amount;
  readonly required: Amount;
}

/* A valid amount can never contain i/l/o: the only suffixes are K/M/B/T/Q and
   the longer Qa/Qi/Sx/Sp/Oc/No/Dc forms, which parse before repair runs. */
const GLYPH_FIXES: Readonly<Record<string, string>> = { "!": "1", i: "1", l: "1", o: "0", "|": "1" };

const STRICT_PAIR = /EXP\s*:?\s*([^\s/]+)\s*\/\s*([^\s]+)/i;
/* Fallback when OCR glues junk onto the label or the numbers ("EXP|1.06T").
   Same line only: a missing EXP value must never borrow the HP bar's numbers. */
const LOOSE_PAIR = /EXP[^\n0-9]{0,12}(\d[\d.,]*\s*[A-Za-z]{0,2})\s*\/\s*(\d[\d.,]*\s*[A-Za-z]{0,2})/i;
const AMOUNT_TOKEN = /\d+(?:[.,]\d+)?\s*(?:Qa|Qi|Sx|Sp|Oc|No|Dc|K|M|B|T|Q)?/gi;

function stripJunk(raw: string): string {
  return raw.replace(/^[^0-9~+-]+/, "").replace(/[^0-9a-z.+-]+$/i, "");
}

/** Undo the digit/letter swaps Tesseract makes on HUD glyphs (`l.06T`, `1.O6T`). */
function repairGlyphs(raw: string): string {
  return stripJunk(raw).replace(/[|!ilo]/gi, (char) => GLYPH_FIXES[char.toLowerCase()] ?? char);
}

function readAmount(raw: string): Amount | null {
  const direct = parseAmountInput(raw);
  if (Number.isFinite(direct)) return { text: raw.trim(), value: direct };
  const repaired = repairGlyphs(raw);
  const value = parseAmountInput(repaired);
  return Number.isFinite(value) ? { text: repaired, value } : null;
}

function normalized(value: number): string {
  return formatCompact(value).toLowerCase().replace(/\s+/g, "");
}

function requiredMatchesLevel(required: number, level: number): boolean {
  const total = xpForLevel(level);
  return normalized(required) === normalized(total) || normalized(required) === formatCompactTruncated(total).toLowerCase().replace(/\s+/g, "");
}

function readPair(text: string): AmountPair | null {
  for (const pattern of [STRICT_PAIR, LOOSE_PAIR]) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const current = readAmount(match[1] ?? "");
    const required = readAmount(match[2] ?? "");
    if (current !== null && required !== null) return { current, required };
  }
  return null;
}

export function inferLevelForRequired(requiredXp: string): number | null {
  const amount = readAmount(requiredXp);
  if (amount === null) return null;
  const matches: number[] = [];
  for (let level = MIN_LEVEL; level < MAX_LEVEL; level += 1) {
    if (requiredMatchesLevel(amount.value, level)) matches.push(level);
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function explicitLevel(text: string): number | null {
  const labelled = /level\s*:?\s*(\d{1,3})/i.exec(text);
  const standalone = text.split("\n").map((line) => line.trim()).find((line) => /^\d{1,3}$/.test(line));
  const raw = labelled?.[1] ?? standalone;
  if (raw === undefined) return null;
  const level = Number(raw);
  return Number.isInteger(level) && level >= MIN_LEVEL && level < MAX_LEVEL ? level : null;
}

interface ExpToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly suffixed: boolean;
}

function readTokens(segment: string): ExpToken[] {
  return [...segment.matchAll(AMOUNT_TOKEN)].map((match) => {
    const text = match[0].trim();
    const start = match.index ?? 0;
    return { end: start + match[0].length, start, suffixed: /[a-z]$/i.test(text), text };
  });
}

/** The slash often leaves a stray leading digit on the total ("72.40T" for "2.40T"). */
function requiredVariants(raw: string): string[] {
  const variants = [raw];
  const withoutLead = /^\d(\d[\d.,]*\s*[A-Za-z]{0,2})$/i.exec(raw);
  if (withoutLead?.[1] !== undefined) variants.push(withoutLead[1]);
  return variants;
}

/**
  Last resort for small HUD crops where the decimal points were lost and pieces
  of glyphs survived: pick the one compact amount next to the slash that maps to
  exactly one level in the XP curve. Anything ambiguous stays unread rather than
  guessing a wrong total.
*/
function recoverPair(text: string): (AmountPair & { readonly level: number }) | null {
  const marker = /EXP/i.exec(text);
  if (marker === null) return null;
  const segment = text.slice(marker.index);
  const slash = segment.indexOf("/");
  if (slash < 0) return null;
  const tokens = readTokens(segment);
  const currentToken = tokens.filter((token) => token.suffixed && token.end <= slash).at(-1);
  const requiredToken = tokens.find((token) => token.start > slash);
  if (currentToken === undefined || requiredToken === undefined || !requiredToken.suffixed) return null;
  const current = readAmount(currentToken.text);
  if (current === null) return null;
  const levels = new Set<number>();
  let resolved: { readonly level: number; readonly required: Amount } | null = null;
  for (const variant of requiredVariants(requiredToken.text)) {
    const level = inferLevelForRequired(variant);
    if (level === null) continue;
    const amount = readAmount(variant);
    if (amount === null) continue;
    levels.add(level);
    resolved ??= { level, required: amount };
  }
  if (resolved === null || levels.size !== 1) return null;
  if (current.value > resolved.required.value) return null;
  return { current, level: resolved.level, required: resolved.required };
}

function settle(text: string, pair: AmountPair & { readonly level?: number }): XpTextResult {
  const explicit = explicitLevel(text);
  const level = pair.level ?? explicit ?? inferLevelForRequired(pair.required.text);
  if (explicit !== null && !requiredMatchesLevel(pair.required.value, explicit)) {
    return { kind: "ok", level: explicit, currentXp: pair.current.text, warning: `EXP total does not match level ${explicit}; check it before calculating.` };
  }
  return {
    kind: "ok",
    level,
    currentXp: pair.current.text,
    warning: level === null ? "Couldn't determine a unique level from this EXP bar; enter it manually." : null,
  };
}

/** Name the OCR line that failed so a bad read is diagnosable, not a mystery. */
function unreadableExp(text: string): XpTextResult {
  const line = text.split("\n").map((value) => value.trim()).find((value) => /EXP/i.test(value)) ?? "";
  const excerpt = line.slice(0, 40);
  return {
    kind: "error",
    message: excerpt === ""
      ? "Couldn't read the EXP values; enter them manually."
      : `Couldn't read the EXP values (read “${excerpt}”); enter them manually.`,
  };
}

export function parseXpText(text: string): XpTextResult {
  const pair = readPair(text);
  if (pair !== null && pair.required.value > 0 && pair.current.value <= pair.required.value) {
    return settle(text, pair);
  }
  const recovered = recoverPair(text);
  if (recovered !== null) return settle(text, recovered);
  if (pair === null) {
    return /EXP/i.test(text) ? unreadableExp(text) : { kind: "error", message: "Couldn't find an EXP bar in that screenshot." };
  }
  if (!(pair.required.value > 0)) return unreadableExp(text);
  return { kind: "error", message: "Current EXP exceeds the level total; check the screenshot or enter it manually." };
}
