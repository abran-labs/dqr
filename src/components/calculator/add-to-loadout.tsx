import { ExternalLink } from "lucide-react";
import * as React from "react";

import { SlotIcon } from "@/components/calculator/slot-icon";
import { Button } from "@/components/ui/button";
import type { DqrItem, ItemClass } from "@/lib/dqr-items";
import { inferSlotId, type LoadoutSlotId, type SlotDraft } from "@/lib/loadout-model";
import { addDraftToLoadout } from "@/lib/loadout-transfer";

const ARMOR_CLASSES: ReadonlySet<ItemClass> = new Set(["dps", "guardian"]);

export function AddToLoadout({ draft, item }: { readonly draft: SlotDraft; readonly item: DqrItem }) {
  const [addedSlot, setAddedSlot] = React.useState<LoadoutSlotId | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setAddedSlot(null), [draft]);
  const inferred = ARMOR_CLASSES.has(item.class) ? inferSlotId(item, draft.title) : "weapon";
  const targets: readonly LoadoutSlotId[] = inferred === null ? ["helmet", "armor"] : [inferred];
  const weaponOffense =
    item.class === "mage" || (item.class === "hybrid" && draft.offense === "spell") ? "spell" : "physical";
  const add = (slot: LoadoutSlotId) => {
    try {
      const result = addDraftToLoadout(window.localStorage, draft, slot);
      if (!result.ok) {
        setAddedSlot(null);
        setError(result.reason === "write-denied" ? "Couldn't save in this browser." : "That item doesn't fit this slot.");
        return;
      }
      setError(null);
      setAddedSlot(slot);
    } catch (error) {
      // no-excuse-ok: catch — browser storage is an optional external boundary.
      if (!(error instanceof DOMException)) throw error;
      setAddedSlot(null);
      setError("Couldn't save in this browser.");
    }
  };
  return (
    <>
      {targets.map((slot) => {
        if (addedSlot === slot) {
          return (
            <Button asChild className="h-8 w-8 text-success" key={slot} size="icon" variant="ghost">
              <a aria-label="View gear loadout" href="/loadout/" title="View gear loadout">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          );
        }
        const label = `Add ${slot} to loadout`;
        return (
          <Button
            aria-label={label}
            className="h-8 w-8"
            key={slot}
            onClick={() => add(slot)}
            size="icon"
            title={label}
            type="button"
            variant="ghost"
          >
            <SlotIcon offense={slot === "weapon" ? weaponOffense : null} slot={slot} />
          </Button>
        );
      })}
      {addedSlot !== null && (
        <p className="sr-only" role="status">
          Added to loadout. Other gear and damage settings were preserved.
        </p>
      )}
      {error !== null && (
        <p className="basis-full text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
