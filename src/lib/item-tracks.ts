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

export interface TrackInput {
  readonly itemClass: ItemClass;
  readonly offense: Offense;
  readonly pot: number;
  readonly percentile: number;
  readonly row: ItemRarityRow;
  readonly health: number | null;
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

export function itemTracks(input: TrackInput): readonly Track[] {
  switch (input.itemClass) {
    case "war":
    case "mage":
      return [dpsPot(input)];
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
