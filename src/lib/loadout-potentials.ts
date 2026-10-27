/* Pure draft validation, rarity resolution, and offense-potential adapters. */

import type { DamagePotentials } from "./damage-types";
import { ITEMS, type DqrItem, type ItemClass, type ItemRarityRow } from "./dqr-items";
import {
  calculatePotential,
  healthRange,
  resolveRarityRows,
  statRange,
  upsRange,
  type NumberRange,
} from "./pot-utils";
import type { LoadoutOffense, LoadoutSlotId, SlotDraft } from "./loadout-model";

const NULL_POTENTIALS: DamagePotentials = { physical: null, spell: null };
const ARMOR_CLASSES: ReadonlySet<ItemClass> = new Set(["dps", "guardian"]);

const parseNumber = (value: string): number | null => {
  const cleaned = value.replace(/[,_\s]/g, "");
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
};

export interface DraftNumbers {
  readonly done: number | null;
  readonly health: number | null;
  readonly spell: number | null;
  readonly stat: number | null;
  readonly total: number | null;
}

export function parseDraftNumbers(draft: SlotDraft): DraftNumbers {
  return {
    done: parseNumber(draft.upsDoneStr),
    health: parseNumber(draft.healthStr),
    spell: parseNumber(draft.spellStr),
    stat: parseNumber(draft.statStr),
    total: parseNumber(draft.upsTotalStr),
  };
}

export type DraftErrors = {
  readonly total?: string | undefined;
  readonly done?: string | undefined;
  readonly stat?: string | undefined;
  readonly spell?: string | undefined;
  readonly health?: string | undefined;
};

export function validateDraft(draft: SlotDraft, item: DqrItem | null): DraftErrors {
  const errors: { total?: string; done?: string; stat?: string; spell?: string; health?: string } = {};
  if (item === null) return errors;
  const nums = parseDraftNumbers(draft);
  const totalRange = upsRange(item.rows);
  const statBounds = statRange(item.rows, nums.done ?? undefined);
  const wideStat = statRange(item.rows);
  const healthBounds = healthRange(item.rows);
  if (nums.total !== null && totalRange && (nums.total < totalRange.min || nums.total > totalRange.max)) {
    errors.total = `Total upgrades must be between ${totalRange.min} - ${totalRange.max}`;
  }
  if (nums.done !== null && nums.total !== null && nums.done > nums.total) {
    errors.done = "Upgrades can't exceed total upgrades.";
  }
  const outside = (value: number | null, narrow: NumberRange | null): boolean =>
    value !== null && narrow !== null && (value < narrow.min || value > narrow.max) &&
    (wideStat === null || value < wideStat.min || value > wideStat.max);
  if (outside(nums.stat, statBounds) && statBounds !== null) {
    errors.stat = `Stat must be between ${statBounds.min} - ${statBounds.max}`;
  }
  if (outside(nums.spell, statBounds) && statBounds !== null) {
    errors.spell = `Spell Power must be between ${statBounds.min} - ${statBounds.max}`;
  }
  if (nums.health !== null && healthBounds && (nums.health < healthBounds.min || nums.health > healthBounds.max)) {
    errors.health = `Health must be between ${healthBounds.min} - ${healthBounds.max}`;
  }
  return errors;
}

export type DraftResolution =
  | { readonly status: "ambiguous"; readonly survivors: readonly ItemRarityRow[]; readonly pot: number }
  | { readonly status: "empty" | "invalid" | "no-data" | "no-fit" }
  | { readonly status: "ok"; readonly pot: number; readonly row: ItemRarityRow };

export function resolveDraft(draft: SlotDraft, item: DqrItem | null): DraftResolution {
  if (item === null || draft.itemId === "") return { status: "empty" };
  if (item.rows.length === 0) return { status: "no-data" };
  const nums = parseDraftNumbers(draft);
  const errors = validateDraft(draft, item);
  const primary = item.class === "hybrid" ? (nums.stat ?? nums.spell) : nums.stat;
  const assumeMaxed = draft.maxedAssumed && nums.done === null && nums.total === null && primary !== null;
  if (primary === null) return { status: "empty" };
  if (!assumeMaxed && (nums.done === null || nums.total === null)) return { status: "empty" };
  if (Object.values(errors).some((error) => error !== undefined)) return { status: "invalid" };
  const pot = assumeMaxed ? primary : calculatePotential(primary, nums.done ?? 0, nums.total ?? 0);
  const survivors = resolveRarityRows(item, {
    health: nums.health ?? undefined,
    pot,
    upgradesTotal: assumeMaxed ? undefined : (nums.total ?? undefined),
  });
  if (survivors.length === 0) return { status: "no-fit" };
  const chosen = survivors.find((row) => row.rarity === draft.manualRarity);
  if (chosen !== undefined) return { pot, row: chosen, status: "ok" };
  const only = survivors.length === 1 ? survivors[0] : undefined;
  return only === undefined ? { pot, status: "ambiguous", survivors } : { pot, row: only, status: "ok" };
}

export function displayOffenseFor(draft: SlotDraft, item: DqrItem | null): LoadoutOffense {
  if (draft.offense !== null) return draft.offense;
  return item?.class === "mage" ? "spell" : "physical";
}

export function loadoutOffense(drafts: Record<LoadoutSlotId, SlotDraft>): LoadoutOffense | null {
  const offenses = new Set<LoadoutOffense>();
  for (const slot of LOADOUT_SLOTS_FOR_OFFENSE) {
    const draft = drafts[slot];
    const item = findLoadoutItem(draft.itemId);
    if (item === null || item.class === "guardian") continue;
    if (item.class === "hybrid") {
      offenses.add("physical");
      offenses.add("spell");
    } else {
      offenses.add(displayOffenseFor(draft, item));
    }
  }
  const only = offenses.size === 1 ? offenses.values().next().value : undefined;
  return only ?? null;
}

const LOADOUT_SLOTS_FOR_OFFENSE: readonly LoadoutSlotId[] = ["helmet", "armor", "weapon"];

function potFits(draft: SlotDraft, item: DqrItem, pot: number): boolean {
  if (item.rows.length === 0) return true;
  const nums = parseDraftNumbers(draft);
  const assumeMaxed = draft.maxedAssumed && nums.done === null && nums.total === null;
  return resolveRarityRows(item, {
    health: nums.health ?? undefined,
    pot,
    upgradesTotal: assumeMaxed ? undefined : (nums.total ?? undefined),
  }).length > 0;
}

export function itemFitsSlot(item: DqrItem, slot: LoadoutSlotId): boolean {
  return slot === "weapon" ? !ARMOR_CLASSES.has(item.class) : ARMOR_CLASSES.has(item.class);
}

export function slotPotentials(draft: SlotDraft, item: DqrItem | null, slot: LoadoutSlotId): DamagePotentials {
  if (item !== null && !itemFitsSlot(item, slot)) return NULL_POTENTIALS;
  return draftPotentials(draft, item);
}

export function draftPotentials(draft: SlotDraft, item: DqrItem | null): DamagePotentials {
  if (item === null || draft.itemId === "" || item.class === "guardian") return NULL_POTENTIALS;
  const nums = parseDraftNumbers(draft);
  const errors = validateDraft(draft, item);
  if (errors.total !== undefined || errors.done !== undefined) return NULL_POTENTIALS;
  const assumeMaxed = draft.maxedAssumed && nums.done === null && nums.total === null;
  const potOf = (value: number | null, error: string | undefined): number | null => {
    if (value === null || error !== undefined) return null;
    if (!assumeMaxed && (nums.done === null || nums.total === null)) return null;
    const pot = assumeMaxed ? value : calculatePotential(value, nums.done ?? 0, nums.total ?? 0);
    return potFits(draft, item, pot) ? pot : null;
  };
  switch (item.class) {
    case "hybrid":
      return { physical: potOf(nums.stat, errors.stat), spell: potOf(nums.spell, errors.spell) };
    case "mage":
      return { physical: null, spell: potOf(nums.stat, errors.stat) };
    case "war":
      return { physical: potOf(nums.stat, errors.stat), spell: null };
    case "dps": {
      const offense = displayOffenseFor(draft, item);
      return offense === "spell"
        ? { physical: null, spell: potOf(nums.stat, errors.stat) }
        : { physical: potOf(nums.stat, errors.stat), spell: null };
    }
    default:
      return assertNeverClass(item.class);
  }
}

function assertNeverClass(value: never): DamagePotentials {
  throw new Error(`Unexpected item class: ${String(value)}`);
}

export function draftRanges(item: DqrItem | null, done: number | null): {
  readonly total: NumberRange | null;
  readonly stat: NumberRange | null;
  readonly health: NumberRange | null;
} {
  const rows = item?.rows ?? [];
  return { health: healthRange(rows), stat: statRange(rows, done ?? undefined), total: upsRange(rows) };
}

export function inferSlotId(item: DqrItem | null, title: string | null): LoadoutSlotId | null {
  if (item !== null && !ARMOR_CLASSES.has(item.class)) return "weapon";
  const normalized = title?.toLowerCase() ?? "";
  if (/\bhelm(et)?\b|\bhead\b|\bhood\b|\bmask\b|\bcap\b/.test(normalized)) return "helmet";
  if (/\barmou?r\b|\bchest(plate)?\b|\bbody\b|\brobe\b|\bgarb\b/.test(normalized)) return "armor";
  return item?.class === "guardian" ? "armor" : null;
}

export function findLoadoutItem(itemId: string): DqrItem | null {
  return itemId === "" ? null : (ITEMS.find((item) => item.id === itemId) ?? null);
}
