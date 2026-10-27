/*
  Frozen parent-integration contracts for the damage panel.
  The parent owns persistence and gear pots; this panel only edits settings.
*/

export type InnerBuff = "none" | "inner" | "enhanced";

/** Controlled damage-calculator settings — all raw strings except the buff. */
export interface DamageSettings {
  readonly dungeonSlug: string;
  readonly abilitySlug: string;
  readonly skillPoints: string;
  readonly inner: InnerBuff;
}

/** Empty gear choices with enhanced inner enabled by default. */
export const DEFAULT_DAMAGE_SETTINGS: DamageSettings = Object.freeze({
  abilitySlug: "",
  dungeonSlug: "northern-lands",
  inner: "enhanced",
  skillPoints: "",
});

/** Per-track gear pots from the parent calculator. Null = missing. */
export interface DamagePotentials {
  readonly physical: number | null;
  readonly spell: number | null;
}
