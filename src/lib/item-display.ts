import type { DqrItem } from "./dqr-items";
import type { Offense } from "./item-tracks";

/*
  Result-panel title — docs/Info/Item-Data.md armor-set quirk. OCR titles
  are often wrong, so the name always comes from the selected dataset item.
  Armor tooltips name a piece while the dataset names the set, so armor
  gets a closed-set suffix: Mage/Warrior/Guardian Helmet/Armor. The type
  word follows our offense classification (not the OCR string); the
  Helmet/Armor slot follows the title's piece word, normalized.
*/

export type ArmorPiece =
  | "Mage Helmet"
  | "Mage Armor"
  | "Warrior Helmet"
  | "Warrior Armor"
  | "Guardian Helmet"
  | "Guardian Armor";

function pieceSlot(title: string | null): "Helmet" | "Armor" {
  if (title !== null) {
    const t = title.toLowerCase();
    if (/\bhelm(et)?\b|\bhead\b|\bhood\b|\bmask\b|\bcap\b/.test(t)) return "Helmet";
    if (/\barmou?r\b|\bchest\b|\bchestplate\b|\bbody\b|\brobe\b|\bgarb\b/.test(t)) return "Armor";
  }
  return "Armor";
}

export function armorPiece(
  item: Pick<DqrItem, "class" | "name">,
  offense: Offense,
  title: string | null,
): ArmorPiece | null {
  const slot = pieceSlot(title);
  switch (item.class) {
    case "dps":
      return offense === "spell" ? `Mage ${slot}` : `Warrior ${slot}`;
    case "guardian":
      return `Guardian ${slot}`;
    default:
      return null;
  }
}

/** Dataset name for weapons; dataset name + closed-set piece suffix for armor. */
export function displayItemName(
  item: Pick<DqrItem, "class" | "name"> | undefined,
  offense: Offense,
  title: string | null,
): string {
  if (item === undefined) return "";
  const piece = armorPiece(item, offense, title);
  if (piece === null) return item.name;
  if (item.class === "guardian" && /\bguardian\b/i.test(item.name)) return `${item.name} ${piece.split(" ")[1]}`;
  return `${item.name} ${piece}`;
}
