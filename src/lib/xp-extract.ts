import { formatCompact, formatCompactTruncated, MAX_LEVEL, MIN_LEVEL, parseAmountInput, xpForLevel } from "./xp-math";

export type XpTextResult =
  | { readonly kind: "ok"; readonly level: number | null; readonly currentXp: string; readonly warning: string | null }
  | { readonly kind: "error"; readonly message: string };

function canonicalAmount(raw: string): string | null {
  const parsed = parseAmountInput(raw);
  return Number.isFinite(parsed) ? formatCompact(parsed).toLowerCase().replace(/\s+/g, "") : null;
}

function normalized(value: number): string {
  return formatCompact(value).toLowerCase().replace(/\s+/g, "");
}

function requiredMatchesLevel(required: string, level: number): boolean {
  const total = xpForLevel(level);
  return required === normalized(total) || required === formatCompactTruncated(total).toLowerCase().replace(/\s+/g, "");
}

export function inferLevelForRequired(requiredXp: string): number | null {
  const required = canonicalAmount(requiredXp);
  if (required === null) return null;
  const matches: number[] = [];
  for (let level = MIN_LEVEL; level < MAX_LEVEL; level += 1) {
    if (requiredMatchesLevel(required, level)) matches.push(level);
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

export function parseXpText(text: string): XpTextResult {
  const match = /EXP\s*:?\s*([^\s/]+)\s*\/\s*([^\s]+)/i.exec(text);
  if (match === null) return { kind: "error", message: "Couldn't find an EXP bar in that screenshot." };
  const currentXp = match[1] ?? "";
  const requiredXp = match[2] ?? "";
  const current = parseAmountInput(currentXp);
  const required = parseAmountInput(requiredXp);
  if (!Number.isFinite(current) || !Number.isFinite(required) || required <= 0) {
    return { kind: "error", message: "Couldn't read the EXP values; enter them manually." };
  }
  if (current > required) return { kind: "error", message: "Current EXP exceeds the level total; check the screenshot or enter it manually." };
  const explicit = explicitLevel(text);
  const level = explicit ?? inferLevelForRequired(requiredXp);
  const canonicalRequired = canonicalAmount(requiredXp);
  if (explicit !== null && canonicalRequired !== null && !requiredMatchesLevel(canonicalRequired, explicit)) {
    return { kind: "ok", level: explicit, currentXp, warning: `EXP total does not match level ${explicit}; check it before calculating.` };
  }
  return {
    kind: "ok",
    level,
    currentXp,
    warning: level === null ? "Couldn't determine a unique level from this EXP bar; enter it manually." : null,
  };
}
