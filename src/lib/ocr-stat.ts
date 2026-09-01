/*
  Which tooltip number is the current primary stat, and what to call the field.
  DPS armor shows both physical and spell; the piece name (Warrior vs Mage)
  plus in-range magnitude pick the real track.
*/

import type { DqrItem, ItemClass } from "./dqr-items";
import type { ExtractedTooltip } from "./ocr-extract";
import { statRange } from "./pot-utils";

export type StatKind = "physical" | "spell" | "health";

export type PickedStat = {
  readonly kind: StatKind | null;
  readonly value: number | null;
};

function assertNever(value: never): never {
  throw new Error(`unexpected: ${String(value)}`);
}

function titleTrack(title: string | null): "physical" | "spell" | null {
  if (title === null) return null;
  const t = title.toLowerCase();
  if (/\bwarrior\b/.test(t)) return "physical";
  if (/\bmage\b/.test(t)) return "spell";
  return null;
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function accept(value: number | null, min: number | null, max: number | null): number | null {
  if (value === null) return null;
  if (min === null || max === null) return value;
  return inRange(value, min, max) ? value : null;
}

function larger(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

function kindFor(value: number | null, ex: ExtractedTooltip): StatKind | null {
  if (value === null) return null;
  if (value === ex.physical) return "physical";
  if (value === ex.spell) return "spell";
  if (value === ex.health) return "health";
  return null;
}

function boundsOf(item: DqrItem | null): { min: number; max: number } | null {
  if (item === null) return null;
  return statRange(item.rows);
}

function pickClassStat(itemClass: ItemClass, ex: ExtractedTooltip, min: number | null, max: number | null): PickedStat {
  switch (itemClass) {
    case "guardian": {
      const value = accept(ex.health, min, max);
      return { kind: value === null ? null : "health", value };
    }
    case "mage": {
      const value = accept(ex.spell, min, max);
      return { kind: value === null ? null : "spell", value };
    }
    case "war": {
      const value = accept(ex.physical, min, max);
      return { kind: value === null ? null : "physical", value };
    }
    case "hybrid": {
      const physical = accept(ex.physical, min, max);
      if (physical !== null) return { kind: "physical", value: physical };
      const spell = accept(ex.spell, min, max);
      return { kind: spell === null ? null : "spell", value: spell };
    }
    case "dps": {
      const physical = accept(ex.physical, min, max);
      const spell = accept(ex.spell, min, max);
      const track = titleTrack(ex.title);
      if (track === "physical" && physical !== null) return { kind: "physical", value: physical };
      if (track === "spell" && spell !== null) return { kind: "spell", value: spell };
      const value = larger(physical, spell);
      return { kind: kindFor(value, ex), value };
    }
    default:
      return assertNever(itemClass);
  }
}

export function pickTooltipStat(ex: ExtractedTooltip, item: DqrItem | null): PickedStat {
  const bounds = boundsOf(item);
  const min = bounds?.min ?? null;
  const max = bounds?.max ?? null;
  if (item !== null) return pickClassStat(item.class, ex, min, max);
  const value = larger(accept(ex.physical, min, max), accept(ex.spell, min, max));
  return { kind: kindFor(value, ex), value };
}

export function statFieldLabel(item: DqrItem | null, kind: StatKind | null): string {
  if (item === null) {
    switch (kind) {
      case "health":
        return "Health";
      case "physical":
        return "Physical Power";
      case "spell":
        return "Spell Power";
      case null:
        return "Stat";
      default:
        return assertNever(kind);
    }
  }
  switch (item.class) {
    case "guardian":
      return "Health";
    case "mage":
      return "Spell Power";
    case "war":
      return "Physical Damage";
    case "hybrid":
      return kind === "spell" ? "Spell Power" : "Physical Damage";
    case "dps":
      return kind === "spell" ? "Spell Power" : "Physical Power";
    default:
      return assertNever(item.class);
  }
}
