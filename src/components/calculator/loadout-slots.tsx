import { X } from "lucide-react";

import { SlotIcon } from "@/components/calculator/slot-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RARITY_INFO } from "@/lib/dqr-items";
import { displayItemName } from "@/lib/item-display";
import {
  displayOffenseFor,
  findLoadoutItem,
  itemFitsSlot,
  LOADOUT_SLOTS,
  resolveDraft,
  slotPotentials,
  SLOT_LABEL,
  type LoadoutSlotId,
  type SlotDraft,
} from "@/lib/loadout-model";

export function LoadoutSlots({ drafts, hydrated, onRemove }: {
  readonly drafts: Record<LoadoutSlotId, SlotDraft>;
  readonly hydrated: boolean;
  readonly onRemove: (slot: LoadoutSlotId) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {LOADOUT_SLOTS.map((slot) => {
        const draft = drafts[slot];
        const item = findLoadoutItem(draft.itemId);
        const offense = displayOffenseFor(draft, item);
        const slotLabel = (
          <span className="flex items-center justify-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <SlotIcon offense={offense} slot={slot} />
            {SLOT_LABEL[slot]}
          </span>
        );
        const empty = draft.itemId === "" && draft.statStr === "";
        if (!hydrated) {
          return (
            <div className="rounded-lg border border-border bg-surface-lowest p-4 text-center" key={slot}>
              {slotLabel}
              <Skeleton className="mx-auto mt-1 h-4 w-24" />
              <Skeleton className="mx-auto mt-2 h-3 w-12" />
            </div>
          );
        }
        if (empty) {
          return (
            <a
              className="rounded-lg border border-dashed border-border bg-surface-lowest p-4 text-center transition-colors hover:border-primary"
              href="/"
              key={slot}
            >
              {slotLabel}
              <span className="mt-2 block text-sm text-muted-foreground">Fill in from pot calculator page</span>
            </a>
          );
        }
        const resolution = item !== null && !itemFitsSlot(item, slot) ? { status: "invalid" as const } : resolveDraft(draft, item);
        const rarityColor = item === null ? undefined : RARITY_INFO[
          draft.manualRarity ?? (resolution.status === "ok" ? resolution.row.rarity : item.maxRarity)
        ].color;
        const pot = resolution.status === "ok" || resolution.status === "ambiguous"
          ? resolution.pot
          : slotPotentials(draft, item, slot)[offense];
        const name = item === null ? "Unknown saved item" : displayItemName(item, offense, draft.title);
        return (
          <div className="relative rounded-lg border border-border bg-surface-lowest p-4 text-center" key={slot}>
            {slotLabel}
            <span className="mt-1 block truncate text-sm font-medium" style={{ color: rarityColor }} title={name}>{name}</span>
            {pot !== null && <span className="mt-2 block text-xs text-muted-foreground">{pot.toLocaleString("en-GB")} pot</span>}
            <Button aria-label={`Remove ${SLOT_LABEL[slot]}`} className="absolute top-2 right-2 h-8 w-8" onClick={() => onRemove(slot)} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
