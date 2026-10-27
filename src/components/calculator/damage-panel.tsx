import * as React from "react";

import { DamageResultPanel, innerLabel } from "@/components/calculator/damage-result";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { dungeonChrome } from "@/lib/dungeon-display";
import { cn } from "@/lib/utils";
import {
  DUNGEONS,
  abilitiesForDungeon,
  abilityBySlug,
  abilityOffense,
  isAbilityUsable,
  isDamageAbilityChoice,
} from "@/lib/dqr-abilities";
import {
  MAX_SKILL_POINTS,
  calculateDamage,
  parseSkillPoints,
} from "@/lib/damage-math";
import type { DamagePotentials, DamageSettings, InnerBuff } from "@/lib/damage-types";

export type { DamagePotentials, DamageSettings, InnerBuff } from "@/lib/damage-types";
export { DEFAULT_DAMAGE_SETTINGS } from "@/lib/damage-types";

export interface DamagePanelProps {
  readonly weapon: DamagePotentials;
  readonly armor: DamagePotentials;
  readonly helmet: DamagePotentials;
  readonly settings: DamageSettings;
  readonly offenseFilter: "physical" | "spell" | null;
  readonly onSettingsChange: (next: DamageSettings) => void;
}

const INNER_OPTIONS: ReadonlyArray<{ readonly value: InnerBuff; readonly label: string }> = [
  { label: "None", value: "none" },
  { label: "Inner", value: "inner" },
  { label: "Enhanced", value: "enhanced" },
];

/*
  Controlled damage panel — the parent owns gear pots and persists settings.
  Picks the physical track for warriors and spell for mages; guardian health
  is never treated as offense. Null-multiplier abilities stay visible in the
  picker but cannot be selected.
*/
export function DamagePanel({ weapon, armor, helmet, settings, offenseFilter, onSettingsChange }: DamagePanelProps) {
  const [notice, setNotice] = React.useState<string | null>(null);

  const ability =
    settings.abilitySlug === "" ? undefined : abilityBySlug(settings.abilitySlug);
  const offense = ability === undefined ? null : abilityOffense(ability);

  const abilityOptions: ComboboxOption[] = React.useMemo(
    () =>
      [...DUNGEONS].reverse().flatMap((dungeon) => {
        const chrome = dungeonChrome(dungeon.slug, dungeon.name);
        return abilitiesForDungeon(dungeon.slug).filter(isDamageAbilityChoice).filter((ability) => offenseFilter === null || abilityOffense(ability) === offenseFilter).map((ability) => {
          return {
            color: ability.rarityColour,
            description: `${String(ability.multiplier)}×`,
            group: dungeon.name,
            keywords: `${ability.slug} ${dungeon.name}`,
            label: ability.name,
            value: ability.slug,
            ...(chrome.color === undefined ? {} : { groupColor: chrome.color }),
            ...(chrome.icon === undefined ? {} : { groupIcon: chrome.icon }),
          };
        });
      }),
    [offenseFilter],
  );

  React.useEffect(() => {
    if (offenseFilter !== null && offense !== null && offense !== offenseFilter && settings.abilitySlug !== "") {
      onSettingsChange({ ...settings, abilitySlug: "" });
    }
  }, [offenseFilter, offense, onSettingsChange, settings]);

  const handleAbility = (abilitySlug: string) => {
    const picked = abilityBySlug(abilitySlug);
    if (picked !== undefined && !isAbilityUsable(picked)) {
      setNotice(`"${picked.name}" has no recorded multiplier yet, so it can't deal damage.`);
      return;
    }
    setNotice(null);
    onSettingsChange({ ...settings, abilitySlug });
  };

  const skillTrimmed = settings.skillPoints.trim();
  const skillValue = skillTrimmed === "" ? NaN : parseSkillPoints(skillTrimmed);
  const skillError =
    skillTrimmed === "" || Number.isFinite(skillValue)
      ? undefined
      : `Enter a whole number from 0 to ${MAX_SKILL_POINTS.toLocaleString("en-GB")}.`;

  const pots = {
    Armor: offense === null ? null : armor[offense],
    Helmet: offense === null ? null : helmet[offense],
    Weapon: offense === null ? null : weapon[offense],
  };
  const missingGear = Object.entries(pots)
    .filter(([, pot]) => pot === null)
    .map(([name]) => name);

  const ready =
    ability !== undefined &&
    isAbilityUsable(ability) &&
    offense !== null &&
    missingGear.length === 0 &&
    skillError === undefined &&
    skillTrimmed !== "";
  const result = (() => {
    if (!ready || ability === undefined || offense === null) return null;
    const weaponPot = weapon[offense];
    const armorPot = armor[offense];
    const helmetPot = helmet[offense];
    if (weaponPot === null || armorPot === null || helmetPot === null) return null;
    return calculateDamage({
      abilityMultiplier: ability.multiplier ?? 0,
      armorPower: armorPot,
      helmetPower: helmetPot,
      inner: settings.inner,
      skillPoints: skillValue,
      weaponPower: weaponPot,
    });
  })();

  const status = (() => {
    if (settings.abilitySlug !== "" && ability === undefined) return "Unknown ability — pick a spell.";
    if (ability === undefined) return null;
    if (!isAbilityUsable(ability))
      return `"${ability.name}" has no recorded multiplier yet, so it can't deal damage.`;
    if (offense === null)
      return `"${ability.name}" is a Guardian ability — it heals or shields instead of dealing damage. Guardian health is never used as offense here.`;
    if (missingGear.length > 0) return null;
    if (skillTrimmed === "" || skillError !== undefined) return "Enter skill points to see damage.";
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border border-border bg-surface-lowest p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="damage-ability">
            Spell
          </label>
          <Combobox
            id="damage-ability"
            onChange={handleAbility}
            options={abilityOptions}
            placeholder="Select a spell"
            searchPlaceholder="Search spells…"
            value={settings.abilitySlug}
          />
          {notice !== null && (
            <p className="text-sm text-destructive" role="alert">
              {notice}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="damage-skill">
            Skill points
          </label>
          <Input
            aria-invalid={skillError !== undefined}
            className={cn(skillError !== undefined && "border-destructive")}
            id="damage-skill"
            inputMode="numeric"
            onChange={(e) => {
              const next = e.target.value.replace(/\D+/g, "");
              if (e.target.value !== next) e.target.value = next;
              onSettingsChange({ ...settings, skillPoints: next });
            }}
            placeholder="Enter skill points"
            value={settings.skillPoints}
          />
          {skillError !== undefined && (
            <p className="text-sm text-destructive" role="alert">
              {skillError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground" id="damage-inner-label">
            Inner buff
          </span>
          <div aria-labelledby="damage-inner-label" className="flex gap-2" role="group">
            {INNER_OPTIONS.map((option) => (
              <button
                aria-pressed={settings.inner === option.value}
                className={cn(
                  "flex-1 rounded-sm border border-border px-3 py-2 text-sm transition-colors",
                  settings.inner === option.value
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option.value}
                onClick={() => onSettingsChange({ ...settings, inner: option.value })}
                type="button"
              >
                {innerLabel(option.value, offenseFilter)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result !== null && ability !== undefined && offense !== null ? (
        <DamageResultPanel accentColor={ability.rarityColour} result={result} title={ability.name} />
      ) : (
        status !== null && <p className="text-sm text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
