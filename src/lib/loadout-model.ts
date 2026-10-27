/* Three gear slots and immutable loadout transitions. Browser/OCR code lives elsewhere. */

import { DEFAULT_DAMAGE_SETTINGS, type DamageSettings } from "./damage-types";
import type { Rarity } from "./dqr-items";

export type LoadoutSlotId = "helmet" | "armor" | "weapon";
export type LoadoutOffense = "physical" | "spell";
export type LoadoutSettings = DamageSettings;

export const LOADOUT_SLOTS = ["helmet", "armor", "weapon"] as const satisfies readonly LoadoutSlotId[];
export const SLOT_LABEL: Record<LoadoutSlotId, string> = { armor: "Armor", helmet: "Helmet", weapon: "Weapon" };
export const DEFAULT_LOADOUT_SETTINGS: DamageSettings = DEFAULT_DAMAGE_SETTINGS;

export interface SlotDraft {
  readonly itemId: string;
  readonly manualRarity: Rarity | null;
  readonly statStr: string;
  readonly spellStr: string;
  readonly upsDoneStr: string;
  readonly upsTotalStr: string;
  readonly healthStr: string;
  readonly title: string | null;
  readonly offense: LoadoutOffense | null;
  readonly maxedAssumed: boolean;
}

export function blankSlotDraft(): SlotDraft {
  return {
    healthStr: "",
    itemId: "",
    manualRarity: null,
    maxedAssumed: false,
    offense: null,
    spellStr: "",
    statStr: "",
    title: null,
    upsDoneStr: "",
    upsTotalStr: "",
  };
}

export interface LoadoutState {
  readonly activeSlot: LoadoutSlotId;
  readonly drafts: Record<LoadoutSlotId, SlotDraft>;
  readonly revisions: Record<LoadoutSlotId, number>;
  readonly settings: LoadoutSettings;
}

const blankRevisions = (): Record<LoadoutSlotId, number> => ({ armor: 0, helmet: 0, weapon: 0 });

export function initialLoadoutState(): LoadoutState {
  return {
    activeSlot: "weapon",
    drafts: { armor: blankSlotDraft(), helmet: blankSlotDraft(), weapon: blankSlotDraft() },
    revisions: blankRevisions(),
    settings: DEFAULT_LOADOUT_SETTINGS,
  };
}

export type SlotField = "healthStr" | "itemId" | "spellStr" | "statStr" | "upsDoneStr" | "upsTotalStr";

export type LoadoutAction =
  | { readonly slot: LoadoutSlotId; readonly field: SlotField; readonly type: "setField"; readonly value: string }
  | { readonly rarity: Rarity | null; readonly slot: LoadoutSlotId; readonly type: "setRarity" }
  | { readonly offense: LoadoutOffense; readonly slot: LoadoutSlotId; readonly type: "setOffense" }
  | { readonly slot: LoadoutSlotId; readonly type: "setActiveSlot" }
  | { readonly settings: LoadoutSettings; readonly type: "setSettings" }
  | { readonly slot: LoadoutSlotId; readonly type: "beginSlotWork" }
  | { readonly draft: SlotDraft; readonly revision: number; readonly slot: LoadoutSlotId; readonly type: "applyScan" }
  | {
      readonly partial: Partial<Pick<SlotDraft, "healthStr" | "spellStr" | "statStr" | "upsDoneStr" | "upsTotalStr">>;
      readonly revision: number;
      readonly slot: LoadoutSlotId;
      readonly type: "applyFieldPaste";
    }
  | { readonly slot: LoadoutSlotId; readonly type: "clearSlot" }
  | {
      readonly activeSlot: LoadoutSlotId;
      readonly settings: LoadoutSettings;
      readonly slots: Record<LoadoutSlotId, SlotDraft>;
      readonly type: "hydrate";
    };

function bumpRevision(state: LoadoutState, slot: LoadoutSlotId): Record<LoadoutSlotId, number> {
  return { ...state.revisions, [slot]: state.revisions[slot] + 1 };
}

export function loadoutReducer(state: LoadoutState, action: LoadoutAction): LoadoutState {
  switch (action.type) {
    case "setField":
      return {
        ...state,
        drafts: { ...state.drafts, [action.slot]: { ...state.drafts[action.slot], [action.field]: action.value } },
        revisions: bumpRevision(state, action.slot),
      };
    case "setRarity":
      return {
        ...state,
        drafts: { ...state.drafts, [action.slot]: { ...state.drafts[action.slot], manualRarity: action.rarity } },
        revisions: bumpRevision(state, action.slot),
      };
    case "setOffense":
      return {
        ...state,
        drafts: { ...state.drafts, [action.slot]: { ...state.drafts[action.slot], offense: action.offense } },
        revisions: bumpRevision(state, action.slot),
      };
    case "setActiveSlot":
      return { ...state, activeSlot: action.slot };
    case "setSettings":
      return { ...state, settings: action.settings };
    case "beginSlotWork":
      return { ...state, revisions: bumpRevision(state, action.slot) };
    case "applyScan":
      return action.revision === state.revisions[action.slot]
        ? { ...state, drafts: { ...state.drafts, [action.slot]: action.draft } }
        : state;
    case "applyFieldPaste":
      if (action.revision !== state.revisions[action.slot]) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [action.slot]: { ...state.drafts[action.slot], ...action.partial } },
        revisions: bumpRevision(state, action.slot),
      };
    case "clearSlot":
      return {
        ...state,
        drafts: { ...state.drafts, [action.slot]: blankSlotDraft() },
        revisions: bumpRevision(state, action.slot),
      };
    case "hydrate":
      return {
        activeSlot: action.activeSlot,
        drafts: action.slots,
        revisions: blankRevisions(),
        settings: action.settings,
      };
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected loadout action: ${JSON.stringify(value)}`);
}

export {
  displayOffenseFor,
  draftPotentials,
  draftRanges,
  findLoadoutItem,
  inferSlotId,
  itemFitsSlot,
  loadoutOffense,
  parseDraftNumbers,
  resolveDraft,
  slotPotentials,
  validateDraft,
} from "./loadout-potentials";
export type { DraftErrors, DraftNumbers, DraftResolution } from "./loadout-potentials";
