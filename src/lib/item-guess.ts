/*
  Identify an item from tooltip numbers when OCR missed the name.
  Unique fingerprint only — overlapping ranges stay unmatched.
*/

import { ITEMS, type DqrItem, type ItemClass, type ItemRarityRow, type Rarity } from "./dqr-items";
import { UPGRADE_STEP } from "./pot-utils";

export type StatFingerprint = {
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
  readonly rarity: Rarity | null;
};

function assertNever(value: never): never {
  throw new Error(`unexpected: ${String(value)}`);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function currentFits(current: number, row: ItemRarityRow, done: number, total: number): boolean {
  if (!inRange(total, row.minUps, row.maxUps)) return false;
  return inRange(current, row.minBase + done * UPGRADE_STEP, row.maxBase + done * UPGRADE_STEP);
}

function healthFits(row: ItemRarityRow, health: number | null): boolean {
  if (health === null) return true;
  if (row.lowestHealth === undefined || row.highestHealth === undefined) return false;
  return inRange(health, row.lowestHealth, row.highestHealth);
}

function classFits(itemClass: ItemClass, row: ItemRarityRow, stats: StatFingerprint & { upsDone: number; upsTotal: number }): boolean {
  switch (itemClass) {
    case "war":
      return (
        stats.physical !== null &&
        currentFits(stats.physical, row, stats.upsDone, stats.upsTotal) &&
        healthFits(row, stats.health)
      );
    case "mage":
      return (
        stats.spell !== null &&
        currentFits(stats.spell, row, stats.upsDone, stats.upsTotal) &&
        healthFits(row, stats.health)
      );
    case "guardian":
      return stats.health !== null && currentFits(stats.health, row, stats.upsDone, stats.upsTotal);
    case "hybrid": {
      const anyOffense = stats.physical !== null || stats.spell !== null;
      const physicalOk = stats.physical === null || currentFits(stats.physical, row, stats.upsDone, stats.upsTotal);
      const spellOk = stats.spell === null || currentFits(stats.spell, row, stats.upsDone, stats.upsTotal);
      return anyOffense && physicalOk && spellOk && healthFits(row, stats.health);
    }
    case "dps": {
      const physicalOk = stats.physical !== null && currentFits(stats.physical, row, stats.upsDone, stats.upsTotal);
      const spellOk = stats.spell !== null && currentFits(stats.spell, row, stats.upsDone, stats.upsTotal);
      return (physicalOk || spellOk) && healthFits(row, stats.health);
    }
    default:
      return assertNever(itemClass);
  }
}

function itemFits(item: DqrItem, stats: StatFingerprint & { upsDone: number; upsTotal: number }): boolean {
  return item.rows.some((row) => {
    if (stats.rarity !== null && row.rarity !== stats.rarity) return false;
    return classFits(item.class, row, stats);
  });
}

export function guessItem(stats: StatFingerprint): DqrItem | null {
  if (stats.upsDone === null || stats.upsTotal === null) return null;
  if (stats.physical === null && stats.spell === null && stats.health === null) return null;
  const known = { ...stats, upsDone: stats.upsDone, upsTotal: stats.upsTotal };
  const matches = ITEMS.filter((item) => itemFits(item, known));
  if (matches.length === 1) {
    const [only] = matches;
    return only ?? null;
  }
  if (matches.length === 0 && stats.rarity !== null) {
    return guessItem({ ...stats, rarity: null });
  }
  return null;
}
