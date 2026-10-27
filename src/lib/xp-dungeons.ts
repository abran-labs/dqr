/*
  XP dungeon dataset — ported from the official DQR Wiki XP calculator,
  including fractional Winter Outpost values and the Northern Lands bonus boss.
*/

export type XpDifficultyName = "easy" | "medium" | "hard" | "insane" | "nightmare" | "bonus-boss";
export type XpBossTier = `tier-${number}`;
export type XpDifficultyId = XpDifficultyName | XpBossTier;

export interface XpDifficulty {
  readonly difficulty: XpDifficultyId;
  readonly experience: number;
}

export interface XpDungeon {
  readonly slug: string;
  readonly name: string;
  readonly difficulties: readonly XpDifficulty[];
}

const dungeon = (slug: string, name: string, difficulties: ReadonlyArray<readonly [XpDifficultyName, number]>): XpDungeon => ({
  difficulties: difficulties.map(([difficulty, experience]) => ({ difficulty, experience })),
  name,
  slug,
});

export const DUNGEONS: readonly XpDungeon[] = [
  dungeon("desert-temple", "Desert Temple", [
    ["easy", 457],
    ["medium", 951],
    ["hard", 2047],
    ["insane", 3200],
    ["nightmare", 6418],
  ]),
  dungeon("winter-outpost", "Winter Outpost", [
    ["easy", 8515],
    ["medium", 12161],
    ["hard", 21432.5],
    ["insane", 37058.75],
    ["nightmare", 61510],
  ]),
  dungeon("pirate-island", "Pirate Island", [
    ["insane", 49018],
    ["nightmare", 78775],
  ]),
  dungeon("king-s-castle", "King's Castle", [
    ["insane", 135900],
    ["nightmare", 271800],
  ]),
  dungeon("the-underworld", "The Underworld", [
    ["insane", 546000],
    ["nightmare", 924000],
  ]),
  dungeon("samurai-palace", "Samurai Palace", [
    ["insane", 1724000],
    ["nightmare", 2280000],
  ]),
  dungeon("the-canals", "The Canals", [
    ["insane", 4594000],
    ["nightmare", 8005000],
  ]),
  dungeon("ghastly-harbor", "Ghastly Harbor", [
    ["insane", 12840000],
    ["nightmare", 24160000],
  ]),
  dungeon("steampunk-sewers", "Steampunk Sewers", [
    ["insane", 35700000],
    ["nightmare", 59600000],
  ]),
  dungeon("boss-raids", "Boss Raids", [
    ["insane", 130000000],
    ["nightmare", 130000000],
  ]),
  dungeon("orbital-outpost", "Orbital Outpost", [
    ["insane", 333000000],
    ["nightmare", 480000000],
  ]),
  dungeon("volcanic-chambers", "Volcanic Chambers", [
    ["insane", 1130000000],
    ["nightmare", 1843500000],
  ]),
  dungeon("aquatic-temple", "Aquatic Temple", [
    ["insane", 3054000000],
    ["nightmare", 5346000000],
  ]),
  dungeon("enchanted-forest", "Enchanted Forest", [
    ["insane", 10350000000],
    ["nightmare", 16920000000],
  ]),
  dungeon("northern-lands", "Northern Lands", [
    ["insane", 19154000000],
    ["nightmare", 38100000000],
    ["bonus-boss", 60100000000],
  ]),
  dungeon("gilded-skies", "Gilded Skies", [
    ["insane", 66500000000],
    ["nightmare", 120000000000],
  ]),
];

export const DIFFICULTY_LABELS: Record<XpDifficultyName, string> = {
  "bonus-boss": "Nightmare + Bonus Boss",
  easy: "Easy",
  hard: "Hard",
  insane: "Insane",
  medium: "Medium",
  nightmare: "Nightmare",
};

export const DIFFICULTY_COLORS: Record<XpDifficultyName, string> = {
  "bonus-boss": "#F59E0B",
  easy: "#4ADE80",
  hard: "#FACC15",
  insane: "#F87171",
  medium: "#38BDF8",
  nightmare: "#B092DA",
};

const DIFFICULTY_ORDER: readonly XpDifficultyName[] = ["bonus-boss", "nightmare", "insane", "hard", "medium", "easy"];
const BASE_LABELS: Readonly<Record<string, string>> = DIFFICULTY_LABELS;
const BASE_COLORS: Readonly<Record<string, string>> = DIFFICULTY_COLORS;

function bossTier(tier: number): XpBossTier {
  return `tier-${tier}`;
}

export function difficultyLabel(id: XpDifficultyId): string {
  const tier = /^tier-(\d+)$/.exec(id);
  if (tier !== null) return `Tier ${tier[1]}`;
  return BASE_LABELS[id] ?? id;
}

export function difficultyColor(id: XpDifficultyId): string {
  return BASE_COLORS[id] ?? "#F87171";
}

function difficultyRank(id: XpDifficultyId): number {
  const rank = DIFFICULTY_ORDER.findIndex((entry) => entry === id);
  return rank === -1 ? DIFFICULTY_ORDER.length : rank;
}

/** Both historical slugs count — the official checks `boss-raids` and `boss-raid`. */
export function isBossRaidSlug(slug: string): boolean {
  return slug === "boss-raids" || slug === "boss-raid";
}

const XP_DUNGEON_ICONS: Readonly<Record<string, string>> = {
  "aquatic-temple": "/dungeons/AT.webp",
  "desert-temple": "/dungeons/DT.webp",
  "enchanted-forest": "/dungeons/EF.webp",
  "ghastly-harbor": "/dungeons/GH.webp",
  "gilded-skies": "/dungeons/GS.webp",
  "king-s-castle": "/dungeons/KC.webp",
  "northern-lands": "/dungeons/NL.webp",
  "orbital-outpost": "/dungeons/OO.webp",
  "pirate-island": "/dungeons/PI.webp",
  "samurai-palace": "/dungeons/SP.webp",
  "steampunk-sewers": "/dungeons/SS.webp",
  "the-canals": "/dungeons/TC.webp",
  "the-underworld": "/dungeons/UW.webp",
  "volcanic-chambers": "/dungeons/VC.webp",
  "winter-outpost": "/dungeons/WO.webp",
};

export function xpDungeonIcon(slug: string): string | undefined {
  return XP_DUNGEON_ICONS[slug];
}

export function findDungeon(slug: string): XpDungeon | undefined {
  return DUNGEONS.find((entry) => entry.slug === slug);
}

/**
 * Boss Raids list all 30 tiers (same XP) highest-first. Other dungeons sort
 * highest difficulty first, with the bonus-boss run at the top.
 */
export function bossVisibleDifficulties(
  slug: string,
  difficulties: readonly XpDifficulty[],
): readonly XpDifficulty[] {
  if (isBossRaidSlug(slug)) {
    const experience = difficulties.find((entry) => entry.experience > 0)?.experience ?? 130_000_000;
    return Array.from({ length: 30 }, (_, index) => ({
      difficulty: bossTier(30 - index),
      experience,
    }));
  }
  return [...difficulties].sort((left, right) => difficultyRank(left.difficulty) - difficultyRank(right.difficulty));
}

/** Stored difficulty when valid, else the highest visible one. */
export function resolveDifficulty(
  dungeon: XpDungeon | undefined,
  stored: string,
): XpDifficulty | undefined {
  const visible = bossVisibleDifficulties(dungeon?.slug ?? "", dungeon?.difficulties ?? []);
  return visible.find((entry) => entry.difficulty === stored) ?? visible[0];
}
