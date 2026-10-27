import * as React from "react";

import { DamagePanel } from "@/components/calculator/damage-panel";
import { LoadoutSlots } from "@/components/calculator/loadout-slots";
import { Card, CardContent } from "@/components/ui/card";
import type { DamageSettings } from "@/lib/damage-types";
import { blankSlotDraft, findLoadoutItem, initialLoadoutState, loadoutOffense, slotPotentials, type LoadoutSlotId } from "@/lib/loadout-model";
import { loadLoadout, saveLoadout, toPersisted, type PersistedLoadout } from "@/lib/loadout-storage";
import { readLevelPreferences } from "@/lib/xp-preferences";

export function LoadoutApp() {
  const [state, setState] = React.useState<PersistedLoadout>(() => toPersisted(initialLoadoutState()));
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const restored = loadLoadout(window.localStorage);
    const level = readLevelPreferences(window.localStorage).fromLevel;
    setState((current) => {
      const base = restored ?? current;
      return {
        ...base,
        settings: { ...base.settings, skillPoints: base.settings.skillPoints || level },
      };
    });
    setHydrated(true);
  }, []);
  React.useEffect(() => {
    if (hydrated) saveLoadout(window.localStorage, state);
  }, [hydrated, state]);

  const remove = (slot: LoadoutSlotId) => {
    setState((current) => ({
      ...current,
      slots: { ...current.slots, [slot]: blankSlotDraft() },
    }));
  };
  const setSettings = (settings: DamageSettings) => setState((current) => ({ ...current, settings }));
  const potentials = {
    armor: slotPotentials(state.slots.armor, findLoadoutItem(state.slots.armor.itemId), "armor"),
    helmet: slotPotentials(state.slots.helmet, findLoadoutItem(state.slots.helmet.itemId), "helmet"),
    weapon: slotPotentials(state.slots.weapon, findLoadoutItem(state.slots.weapon.itemId), "weapon"),
  };

  return (
    <div aria-busy={!hydrated} className="mx-auto w-full max-w-3xl space-y-6">
      <LoadoutSlots drafts={state.slots} hydrated={hydrated} onRemove={remove} />
      <Card>
        <CardContent className="pt-6">
          <DamagePanel {...potentials} offenseFilter={loadoutOffense(state.slots)} onSettingsChange={setSettings} settings={state.settings} />
        </CardContent>
      </Card>
    </div>
  );
}
