/*
  Result tracks — weapon/DPS-armor offense vs Guardian/DPS-armor health.
  See docs/Info/Pot-System.md.
*/

import type { ItemClass, ItemRarityRow } from "./dqr-items";
import { healthPercentile } from "./pot-utils";

export type TrackKind = "dps" | "health";

export type Offense = "physical" | "spell";
export type StatChrome = Offense | "health";

export const TRACK_LABEL: Record<TrackKind, string> = {
  dps: "DPS",
  health: "Health",
};

/** Tooltip glyph colors sampled from assets/Rarities/Common.png. */
export const TRACK_CHROME: Record<StatChrome, string> = {
  health: "#bff585",
  physical: "#d98282",
  spell: "#b092da",
};

export interface Track {
  readonly kind: TrackKind;
  readonly chrome: StatChrome;
  readonly value: number;
  readonly valueLabel: "Potential" | "Health";
  readonly percentile: number;
}

export type HybridPots = {
  readonly physical: { readonly pot: number; readonly percentile: number } | null;
  readonly spell: { readonly pot: number; readonly percentile: number } | null;
};

export interface TrackInput {
  readonly itemClass: ItemClass;
  readonly offense: Offense;
  readonly pot: number;
  readonly percentile: number;
  readonly row: ItemRarityRow;
  readonly health: number | null;
  readonly hybrid: HybridPots | null;
}

function assertNever(value: never): never {
  throw new Error(`unexpected class: ${String(value)}`);
}

const dpsPot = (input: TrackInput): Track => ({
  chrome: input.offense,
  kind: "dps",
  percentile: input.percentile,
  value: input.pot,
  valueLabel: "Potential",
});

export function trackHeading(track: Track, tracks: readonly Track[]): string {
  if (track.kind === "health") return TRACK_LABEL.health;
  const dpsCount = tracks.filter((entry) => entry.kind === "dps").length;
  if (dpsCount > 1) {
    switch (track.chrome) {
      case "physical":
        return "Physical";
      case "spell":
        return "Spell";
      case "health":
        return TRACK_LABEL.health;
      default:
        return assertNever(track.chrome);
    }
  }
  return TRACK_LABEL.dps;
}

function hybridTracks(pots: HybridPots): Track[] {
  const tracks: Track[] = [];
  if (pots.physical !== null) {
    tracks.push({
      chrome: "physical",
      kind: "dps",
      percentile: pots.physical.percentile,
      value: pots.physical.pot,
      valueLabel: "Potential",
    });
  }
  if (pots.spell !== null) {
    tracks.push({
      chrome: "spell",
      kind: "dps",
      percentile: pots.spell.percentile,
      value: pots.spell.pot,
      valueLabel: "Potential",
    });
  }
  return tracks;
}

export function itemTracks(input: TrackInput): readonly Track[] {
  switch (input.itemClass) {
    case "war":
    case "mage":
      return [dpsPot(input)];
    case "hybrid":
      return input.hybrid === null ? [] : hybridTracks(input.hybrid);
    case "guardian":
      return [
        {
          chrome: "health",
          kind: "health",
          percentile: input.percentile,
          value: input.pot,
          valueLabel: "Potential",
        },
      ];
    case "dps": {
      if (input.health === null) return [dpsPot(input)];
      const hp = healthPercentile(input.health, input.row);
      if (hp === null) return [dpsPot(input)];
      return [
        dpsPot(input),
        { chrome: "health", kind: "health", percentile: hp, value: input.health, valueLabel: "Health" },
      ];
    }
    default:
      return assertNever(input.itemClass);
  }
}
