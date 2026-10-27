import type { LoadoutOffense, LoadoutSlotId } from "@/lib/loadout-model";
import { cn } from "@/lib/utils";

export function SlotIcon({ slot, offense = null, className }: {
  readonly slot: LoadoutSlotId;
  readonly offense?: LoadoutOffense | null;
  readonly className?: string;
}) {
  const icon = slot === "weapon" ? (offense === "spell" ? "weapon-mage" : "weapon-warrior") : slot;
  return (
    <span
      aria-hidden
      className={cn(
        "h-4 w-4 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]",
        className,
      )}
      style={{ maskImage: `url("/icons/${icon}.svg?v=2")` }}
    />
  );
}
