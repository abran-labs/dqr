import { calculateDamage } from "./damage-math";
import { ABILITIES, abilityOffense, isDamageAbilityChoice } from "./dqr-abilities";
import { ITEMS } from "./dqr-items";
import { rowPotRange } from "./pot-utils";

/**
 * Skill points behind the ceiling: the top of the in-game leaderboard is level
 * 235, so that is the most anyone can spend today. Bump when the record moves.
 */
const TOP_LEVEL_SKILL_POINTS = 235;

function maxPotentials(): { readonly weapon: readonly [number, number]; readonly armor: readonly [number, number] } {
  let weaponPhysical = 0;
  let weaponSpell = 0;
  let armorPhysical = 0;
  let armorSpell = 0;
  for (const item of ITEMS) {
    for (const row of item.rows) {
      const pot = rowPotRange(row).maxPot;
      if (item.class === "dps") {
        armorPhysical = Math.max(armorPhysical, pot);
        armorSpell = Math.max(armorSpell, pot);
      } else if (item.class !== "guardian") {
        if (item.class === "war" || item.class === "hybrid") weaponPhysical = Math.max(weaponPhysical, pot);
        if (item.class === "mage" || item.class === "hybrid") weaponSpell = Math.max(weaponSpell, pot);
      }
    }
  }
  return { armor: [armorPhysical, armorSpell], weapon: [weaponPhysical, weaponSpell] };
}

export function theoreticalHighestDamage(): number {
  const max = maxPotentials();
  let highest = 0;
  for (const ability of ABILITIES.filter(isDamageAbilityChoice)) {
    const offense = abilityOffense(ability);
    if (offense === null || ability.multiplier === null) continue;
    const weaponPower = offense === "physical" ? max.weapon[0] : max.weapon[1];
    const armorPower = offense === "physical" ? max.armor[0] : max.armor[1];
    const result = calculateDamage({
      abilityMultiplier: ability.multiplier,
      armorPower,
      helmetPower: armorPower,
      inner: "enhanced",
      skillPoints: TOP_LEVEL_SKILL_POINTS,
      weaponPower,
    });
    highest = Math.max(highest, result.average);
  }
  return highest;
}

export const THEORETICAL_MAX_DAMAGE = theoreticalHighestDamage();
