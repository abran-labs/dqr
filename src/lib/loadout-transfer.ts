import { findLoadoutItem, initialLoadoutState, itemFitsSlot, type LoadoutSlotId, type SlotDraft } from "./loadout-model";
import { loadLoadout, saveLoadout, toPersisted, type KeyValueStore, type PersistedLoadout } from "./loadout-storage";

export type LoadoutTransferResult =
  | { readonly ok: true; readonly loadout: PersistedLoadout }
  | { readonly ok: false; readonly reason: "incompatible" | "write-denied" };

export function addDraftToLoadout(store: KeyValueStore, draft: SlotDraft, slot: LoadoutSlotId): LoadoutTransferResult {
  const item = findLoadoutItem(draft.itemId);
  if (item === null || !itemFitsSlot(item, slot)) return { ok: false, reason: "incompatible" };
  const current = loadLoadout(store) ?? toPersisted(initialLoadoutState());
  const loadout: PersistedLoadout = {
    ...current,
    activeSlot: slot,
    slots: { ...current.slots, [slot]: draft },
  };
  return saveLoadout(store, loadout) ? { ok: true, loadout } : { ok: false, reason: "write-denied" };
}
