/*
  Tooltip field extraction — docs/Info/OCR-Input.md. Turns the two OCR
  passes into calculator inputs. Implausible reads stay in the result and
  get flagged by the form's live range validation rather than silently
  dropped.

  Name matching is AbyssFishLog-parity (`src/lib/ocr.ts` there):
  coverage-scaled containment + Dice-coefficient fuzzy fallback, best
  scoring line wins, plain threshold — the coverage scaling is what keeps
  a short item name hidden inside an unrelated word ("apprentice" ⊃
  "Ice") from ever winning. On top of that, DQR armor tooltips name a
  piece ("Midgardian Mage Helmet") while the dataset names the set
  ("Midgardian"), so a word-coverage rule catches fully-covered names
  with extra piece words.
*/

import { ITEMS, type DqrItem } from "./dqr-items";
import type { TooltipScan } from "./ocr";
import { parseUpgradePair, preferUpgradePair } from "./ocr-upgrades";

export interface ExtractedTooltip {
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
  /** Best name match. Null when nothing scored above the threshold. */
  readonly item: DqrItem | null;
  /** Tooltip title as OCR read it ("Midgardian Mage Helmet"). Null if no name-like line. */
  readonly title: string | null;
}

/** Letter→digit confusions common in OCR'd 8–10 digit DQR values. */
const DIGIT_LOOKALIKE: Record<string, string> = {
  b: "8", g: "9", i: "1", l: "1", o: "0", q: "9", s: "5", t: "7", z: "2",
};

function recoverNumber(raw: string): number | null {
  const mapped = raw.toLowerCase().replace(/[bgiloqstz]/g, (c) => DIGIT_LOOKALIKE[c] ?? c);
  const digits = mapped.replace(/[^0-9]/g, "");
  if (digits === "" || digits.length > 15) return null;
  return Number(digits);
}

// Value runs tolerate group separators and contaminated letters but not
// spaces: values never wrap (only labels do), and a space-separated run
// would swallow the first letter of the next label ("Sell:" → +5).
const VALUE = "[0-9bBgGiIlLoOqQsStTzZ,.]+";

// Label wording varies (docs/Info/OCR-Input.md): `Physical Damage:` vs
// `Physical power:`. Values wrap onto the first label line
// (`Physical 739072` / `power:`) or follow the full label.
const PHYS_RE = new RegExp(
  `physical\\s*(?:(?:damage|[prd]ower|dmg)\\s*[:.]?\\s*(${VALUE})|(${VALUE})\\s*(?:damage|[prd]ower|dmg))`,
  "i",
);
const SPELL_RE = new RegExp(
  `spell\\s*(?:power\\s*[:.]?\\s*(${VALUE})|(${VALUE})\\s*power)`,
  "i",
);
const HEALTH_RE = new RegExp(`health\\s*[:.]?\\s*(${VALUE})`, "i");

function fromMatch(match: RegExpExecArray | null): number | null {
  const raw = match?.[1] ?? match?.[2];
  return raw ? nz(recoverNumber(raw)) : null;
}

interface RawFields {
  physical: number | null;
  spell: number | null;
  health: number | null;
  upsDone: number | null;
  upsTotal: number | null;
}

function parsePass(text: string): RawFields {
  const joined = text.replace(/\s*\n\s*/g, " ");
  const ups = parseUpgradePair(joined);
  return {
    health: fromMatch(HEALTH_RE.exec(joined)),
    physical: fromMatch(PHYS_RE.exec(joined)),
    spell: fromMatch(SPELL_RE.exec(joined)),
    upsDone: ups.done,
    upsTotal: ups.total,
  };
}

/** Zero is never a valid stat/health/total roll — a stray "0" line means noise. */
function nz(n: number | null): number | null {
  return n !== null && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

const norm = (s: string): string =>
  s.toLowerCase().replace(/[''`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const ITEM_MATCHERS: ReadonlyArray<readonly [DqrItem, string, readonly string[]]> = ITEMS.map(
  (item) => {
    const n = norm(item.name);
    return [item, n, n.split(" ")] as const;
  },
);

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array.from({ length: b.length }, (_, j) => j + 1),
  ]);
  for (let i = 1; i <= a.length; i++) {
    const row = dp[i] ?? [];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const above = (dp[i - 1] ?? [])[j] ?? 0;
      const left = row[j - 1] ?? 0;
      const diag = (dp[i - 1] ?? [])[j - 1] ?? 0;
      row[j] = Math.min(above + 1, left + 1, diag + cost);
    }
  }
  return (dp[a.length] ?? [])[b.length] ?? 0;
}

function wordSim(w: string, v: string): number {
  if (w === v) return 1;
  return 1 - levenshtein(w, v) / Math.max(w.length, v.length);
}

/**
 * Word-tolerant coverage with consumption: every name word claims its own
 * distinct line word (or joined pair), so one OCR token can't double-serve
 * two name words — that's what let "gurdian" satisfy both `guardian` and
 * `midgardian` inside "Midgardian Guardian" and steal matches from the true
 * item. Longest name words anchor first (most specific). The line is then
 * the item plus piece/qualifier words: "Midgardian Mage Helmet" covers
 * "Midgardian".
 */
function wordCovered(lineWords: readonly string[], nameWords: readonly string[], lineLen: number): number | null {
  const nameLen = nameWords.reduce((n, w) => n + w.length, 0);
  if (nameLen === 0) return null;
  // Candidates: single words plus adjacent joined pairs (reassembles words
  // the OCR split, "Sta)ff" → sta|ff). Each candidate consumes its words.
  const cands: Array<{ text: string; words: number[] }> = lineWords.map((w, i) => ({ text: w, words: [i] }));
  for (let i = 0; i + 1 < lineWords.length; i++) {
    cands.push({ text: (lineWords[i] ?? "") + (lineWords[i + 1] ?? ""), words: [i, i + 1] });
  }
  const taken = new Set<number>();
  const order = [...nameWords.keys()].sort(
    (a, b) => (nameWords[b] ?? "").length - (nameWords[a] ?? "").length,
  );
  let hit = 0;
  for (const wi of order) {
    const w = nameWords[wi] ?? "";
    let best = 0;
    let bestCand: { text: string; words: number[] } | null = null;
    for (const cand of cands) {
      if (cand.words.some((u) => taken.has(u))) continue;
      const s = wordSim(w, cand.text);
      if (s > best) {
        best = s;
        bestCand = cand;
      }
    }
    if (bestCand === null || best < 0.55) return null; // a name word is genuinely missing
    hit += w.length * best;
    for (const u of bestCand.words) taken.add(u);
  }
  const sim = hit / nameLen;
  if (sim < 0.68) return null;
  // Symmetric overlap: full credit only when the name fills the line;
  // a name longer than the line ("Guardian" line vs "… Guardian" name)
  // pays for the missing words instead of getting a free maximum.
  const overlap = nameLen <= lineLen ? nameLen / lineLen : lineLen / nameLen;
  return 0.7 + 0.1 * sim + 0.15 * overlap;
}

function diceBigrams(s: string): string[] {
  const set: string[] = [];
  for (let i = 0; i < s.length - 1; i++) set.push(s.slice(i, i + 2));
  return set;
}

/** Spaces-removed comparison for names the OCR ran together
 * ("TwniBlaadeSl icer" → "twinbladeslicer"). Word matching can't reassemble
 * those, but the joined strings stay close. */
function nospaceScore(line: string, name: string): number {
  const a = line.replace(/ /g, "");
  const b = name.replace(/ /g, "");
  if (a === b) return 0.99;
  if (b.length < 8 || a.length === 0) return 0;
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  if (sim < 0.75) return 0;
  return 0.75 + 0.15 * sim;
}

function similarity(line: string, name: string, lineWords: readonly string[], nameWords: readonly string[]): number {
  if (line === name) return 1;
  if (line.length === 0 || name.length === 0) return 0;
  let score = 0;
  // Coverage-scaled containment (AbyssFishLog): a name buried in an
  // unrelated longer string scores low and stays under the threshold.
  if (line.includes(name)) score = 0.9 * (name.length / line.length);
  else if (name.includes(line)) score = 0.8 * (line.length / name.length);
  // Piece-qualified names ("Bronze Dagger Chestplate" for "Bronze Dagger")
  // must beat containment even when containment itself fires low.
  const covered = wordCovered(lineWords, nameWords, line.length);
  if (covered !== null && covered > score) score = covered;
  const joined = nospaceScore(line, name);
  if (joined > score) score = joined;
  // Short names have no bigram mass — one tolerated edit is the only slack.
  if (name.length <= 4 && line.length <= name.length + 2 && levenshtein(line, name) <= 1) {
    score = Math.max(score, 0.75);
  }
  if (score > 0) return score;
  const aBi = diceBigrams(line);
  const bBi = diceBigrams(name);
  if (aBi.length === 0 || bBi.length === 0) return 0;
  let matches = 0;
  const used = new Set<number>();
  for (const ab of aBi) {
    for (let j = 0; j < bBi.length; j++) {
      if (!used.has(j) && ab === bBi[j]) {
        matches++;
        used.add(j);
        break;
      }
    }
  }
  return (2 * matches) / (aBi.length + bBi.length);
}

/** Debug hook for the matching test scripts — not used by the app. */
export function debugScore(line: string, name: string): number {
  const a = norm(line);
  const b = norm(name);
  return similarity(a, b, a.split(" "), b.split(" "));
}

const NAME_THRESHOLD = 0.55;
const MAX_NAME_LINE = 40;
const LABEL_LINE = /^(physical|spell|power|damage|health|upgrades?|sell|req)\b/i;

function titleLine(text: string): string | null {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.length > MAX_NAME_LINE) continue;
    if ((line.match(/\d/g) ?? []).length >= 3) continue;
    if (LABEL_LINE.test(line)) continue;
    return line;
  }
  return null;
}

/** Best item match across every plausible name line of one OCR pass. */
function passName(text: string): DqrItem | null {
  let best: DqrItem | null = null;
  let bestScore = NAME_THRESHOLD;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.length > MAX_NAME_LINE) continue;
    // Stat/value lines are never names ("Upgrades: 33/331", "Sell: 509…").
    if ((line.match(/\d/g) ?? []).length >= 3) continue;
    const a = norm(line);
    if (a.length === 0) continue;
    const words = a.split(" ");
    for (const [item, name, nameWords] of ITEM_MATCHERS) {
      const score = similarity(a, name, words, nameWords);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return best;
}


export function extractTooltip(scan: TooltipScan): ExtractedTooltip {
  const raw = parsePass(scan.rawText);
  const processed = parsePass(scan.processedText);
  // The white item name only survives the thresholded pass (the color pass
  // washes it out), so names come from processed first.
  const item = passName(scan.nameText) ?? passName(scan.processedText) ?? passName(scan.rawText);
  const ups = preferUpgradePair(
    { done: raw.upsDone, total: raw.upsTotal },
    { done: processed.upsDone, total: processed.upsTotal },
  );
  return {
    health: raw.health ?? processed.health,
    item,
    physical: raw.physical ?? processed.physical,
    spell: raw.spell ?? processed.spell,
    title: titleLine(scan.nameText) ?? titleLine(scan.processedText) ?? titleLine(scan.rawText),
    upsDone: ups.done,
    upsTotal: ups.total,
  };
}
