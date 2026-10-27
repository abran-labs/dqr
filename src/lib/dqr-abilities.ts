/*
  Official ability dataset: types, dungeon list, and lookup helpers.
  The 130 records live in ./dqr-abilities-data (generated, do not hand-edit).
*/

import { ABILITIES } from "./dqr-abilities-data";

export { ABILITIES };

export type AbilityClass = "warrior" | "mage" | "guardian";

export interface AbilityDungeonRef {
  readonly slug: string;
  readonly name: string;
}

export interface DqrAbility {
  readonly classes: readonly AbilityClass[];
  readonly icon: string;
  readonly multiplier: number | null;
  readonly dungeons: readonly AbilityDungeonRef[];
  readonly note: string | null;
  readonly name: string;
  readonly rarity: string;
  readonly rarityColour: string;
  readonly slug: string;
}

export interface DqrDungeon {
  readonly slug: string;
  readonly name: string;
}

export const DUNGEONS: readonly DqrDungeon[] = [
  { name: "Desert Temple", slug: "desert-temple" },
  { name: "Winter Outpost", slug: "winter-outpost" },
  { name: "Pirate Island", slug: "pirate-island" },
  { name: "King's Castle", slug: "king-s-castle" },
  { name: "The Underworld", slug: "the-underworld" },
  { name: "Samurai Palace", slug: "samurai-palace" },
  { name: "The Canals", slug: "the-canals" },
  { name: "Ghastly Harbor", slug: "ghastly-harbor" },
  { name: "Steampunk Sewers", slug: "steampunk-sewers" },
  { name: "Boss Raids", slug: "boss-raids" },
  { name: "Orbital Outpost", slug: "orbital-outpost" },
  { name: "Volcanic Chambers", slug: "volcanic-chambers" },
  { name: "Aquatic Temple", slug: "aquatic-temple" },
  { name: "Enchanted Forest", slug: "enchanted-forest" },
  { name: "Northern Lands", slug: "northern-lands" },
  { name: "Gilded Skies", slug: "gilded-skies" },
];

export function abilityBySlug(slug: string): DqrAbility | undefined {
  return ABILITIES.find((ability) => ability.slug === slug);
}

/** Blank dungeonSlug means all dungeons. Dungeons only filter, never scale. */
export function abilitiesForDungeon(dungeonSlug: string): readonly DqrAbility[] {
  if (dungeonSlug === "") return ABILITIES;
  return ABILITIES.filter((ability) => ability.dungeons.some((dungeon) => dungeon.slug === dungeonSlug));
}

export type AbilityOffense = "physical" | "spell";

/** Warriors strike physical, mages cast spell; guardians heal/shield (null). */
export function abilityOffense(ability: DqrAbility): AbilityOffense | null {
  if (ability.classes.includes("warrior")) return "physical";
  if (ability.classes.includes("mage")) return "spell";
  return null;
}

const BUFF_ABILITY_SLUGS: ReadonlySet<string> = new Set([
  "inner-focus",
  "enhanced-inner-focus",
  "inner-rage",
  "enhanced-inner-rage",
]);

export function isDamageAbilityChoice(ability: DqrAbility): boolean {
  return !BUFF_ABILITY_SLUGS.has(ability.slug) && isAbilityUsable(ability);
}

/** Null (or non-positive) multipliers are shown but never deal damage. */
export function isAbilityUsable(ability: DqrAbility): boolean {
  return ability.multiplier !== null && ability.multiplier > 0;
}
