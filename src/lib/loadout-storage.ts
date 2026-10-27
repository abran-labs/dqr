/*
  Single-loadout browser persistence — one versioned key, drafts + active
  slot + damage settings. No images, OCR text, objectURLs, derived results,
  or feedback IDs. Denied/corrupt storage degrades to blank, never throws.
*/

import {
  blankSlotDraft,
  DEFAULT_LOADOUT_SETTINGS,
  LOADOUT_SLOTS,
  type LoadoutOffense,
  type LoadoutSettings,
  type LoadoutSlotId,
  type LoadoutState,
  type SlotDraft,
} from "./loadout-model";
import type { Rarity } from "./dqr-items";

export const LOADOUT_STORAGE_KEY = "dqr:loadout:v1";
export const LOADOUT_STORAGE_VERSION = 1;

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "ultimate"] as const satisfies readonly Rarity[];

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PersistedSlotDraft = SlotDraft;
export interface PersistedLoadout {
  readonly activeSlot: LoadoutSlotId;
  readonly settings: LoadoutSettings;
  readonly slots: Record<LoadoutSlotId, PersistedSlotDraft>;
  readonly version: typeof LOADOUT_STORAGE_VERSION;
}

export function blankPersistedDraft(): PersistedSlotDraft {
  return blankSlotDraft();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRarity(value: unknown): Rarity | null {
  return typeof value === "string" ? (RARITIES.find((rarity) => rarity === value) ?? null) : null;
}

function asTitle(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOffense(value: unknown): LoadoutOffense | null {
  return value === "physical" || value === "spell" ? value : null;
}

function parseDraft(value: unknown): PersistedSlotDraft {
  const base = blankPersistedDraft();
  if (!isRecord(value)) return base;
  return {
    ...base,
    healthStr: asString(value.healthStr),
    itemId: asString(value.itemId),
    manualRarity: asRarity(value.manualRarity),
    maxedAssumed: value.maxedAssumed === true,
    offense: asOffense(value.offense),
    spellStr: asString(value.spellStr),
    statStr: asString(value.statStr),
    title: asTitle(value.title),
    upsDoneStr: asString(value.upsDoneStr),
    upsTotalStr: asString(value.upsTotalStr),
  };
}

function parseSettings(value: unknown): LoadoutSettings {
  if (!isRecord(value)) return DEFAULT_LOADOUT_SETTINGS;
  const inner = value.inner === "none" || value.inner === "inner" || value.inner === "enhanced"
    ? value.inner
    : DEFAULT_LOADOUT_SETTINGS.inner;
  return {
    abilitySlug: typeof value.abilitySlug === "string" ? value.abilitySlug : DEFAULT_LOADOUT_SETTINGS.abilitySlug,
    dungeonSlug: typeof value.dungeonSlug === "string" ? value.dungeonSlug : DEFAULT_LOADOUT_SETTINGS.dungeonSlug,
    inner,
    skillPoints: typeof value.skillPoints === "string" ? value.skillPoints : DEFAULT_LOADOUT_SETTINGS.skillPoints,
  };
}

function isSlotId(value: unknown): value is LoadoutSlotId {
  return value === "helmet" || value === "armor" || value === "weapon";
}

/** Strict version gate, lenient fields: never throw, null means "start blank". */
export function parseLoadout(raw: unknown): PersistedLoadout | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }
  if (!isRecord(value) || value.version !== LOADOUT_STORAGE_VERSION || !isRecord(value.slots)) return null;
  const slots = value.slots;
  return {
    activeSlot: isSlotId(value.activeSlot) ? value.activeSlot : "weapon",
    settings: parseSettings(value.settings),
    slots: {
      armor: parseDraft(slots.armor),
      helmet: parseDraft(slots.helmet),
      weapon: parseDraft(slots.weapon),
    },
    version: LOADOUT_STORAGE_VERSION,
  };
}

export function serializeLoadout(state: PersistedLoadout): string {
  return JSON.stringify(state);
}

export function toPersisted(state: LoadoutState): PersistedLoadout {
  return {
    activeSlot: state.activeSlot,
    settings: state.settings,
    slots: { ...state.drafts },
    version: LOADOUT_STORAGE_VERSION,
  };
}

export function loadLoadout(store: KeyValueStore): PersistedLoadout | null {
  try {
    const raw = store.getItem(LOADOUT_STORAGE_KEY);
    if (raw === null) return null;
    return parseLoadout(raw);
  } catch {
    // no-excuse-ok: catch — browser storage is an optional external boundary.
    return null;
  }
}

/** False when the browser refuses (private mode, quota) — caller stays usable. */
export function saveLoadout(store: KeyValueStore, state: PersistedLoadout): boolean {
  try {
    store.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(state));
    return true;
  } catch {
    // no-excuse-ok: catch — denied writes must not break the in-memory calculator.
    return false;
  }
}

export { LOADOUT_SLOTS };
