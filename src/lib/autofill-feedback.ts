/*
  Which calculator fields OCR actually wrote, and the per-field vote payload.
  Physical and spell stay distinct — they sit in different tooltip spots.
*/

import type { ExtractedTooltip } from "./ocr-extract";
import { pickTooltipStat } from "./ocr-stat";

export const AUTOFILL_FIELDS = [
  "item",
  "totalUpgrades",
  "upgrades",
  "physical",
  "spell",
  "health",
] as const;

export type AutofillField = (typeof AUTOFILL_FIELDS)[number];

const FIELD_SET: ReadonlySet<string> = new Set(AUTOFILL_FIELDS);
export const AUTOFILL_FAILURE_MESSAGE = "Failed to autofill.";

export function isAutofillField(value: string): value is AutofillField {
  return FIELD_SET.has(value);
}

export type AutofillForm = {
  readonly itemId: string;
  readonly statStr: string;
  readonly spellStr: string;
  readonly upsDoneStr: string;
  readonly upsTotalStr: string;
  readonly healthStr: string;
  readonly fields: readonly AutofillField[];
};

export function missingAutofillFields(
  autofillRan: boolean,
  filledFields: readonly AutofillField[],
): readonly AutofillField[] {
  if (!autofillRan) return [];
  return AUTOFILL_FIELDS.filter((field) => !filledFields.includes(field));
}

export function autofillFailureMessage(
  field: AutofillField,
  value: string,
  missingFields: readonly AutofillField[],
): string | undefined {
  if (value !== "" || !missingFields.includes(field)) return undefined;
  return AUTOFILL_FAILURE_MESSAGE;
}

export type FeedbackPayload = {
  readonly calculationId: number;
  readonly field: AutofillField;
  readonly accurate: boolean;
};

export function parseFeedbackPayload(body: unknown): FeedbackPayload | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("calculationId" in body) || !("field" in body) || !("accurate" in body)) return null;
  const { accurate, calculationId, field } = body;
  if (typeof calculationId !== "number" || !Number.isInteger(calculationId)) return null;
  if (typeof field !== "string" || !isAutofillField(field)) return null;
  if (typeof accurate !== "boolean") return null;
  return { accurate, calculationId, field };
}

function numStr(value: number | null): string {
  return value === null ? "" : String(value);
}

export function autofillFromExtract(ex: ExtractedTooltip): AutofillForm {
  const picked = pickTooltipStat(ex, ex.item);

  const hybrid = ex.item?.class === "hybrid";
  const itemId = ex.item?.id ?? "";
  const statStr = hybrid
    ? numStr(ex.physical)
    : numStr(picked.value);
  const spellStr = hybrid ? numStr(ex.spell) : "";
  const upsDoneStr = numStr(ex.upsDone);
  const upsTotalStr = numStr(ex.upsTotal);
  const healthStr = numStr(ex.health);

  const fields: AutofillField[] = [];
  if (itemId !== "") fields.push("item");
  if (upsTotalStr !== "") fields.push("totalUpgrades");
  if (upsDoneStr !== "") fields.push("upgrades");
  if (hybrid) {
    if (statStr !== "") fields.push("physical");
    if (spellStr !== "") fields.push("spell");
  } else if (statStr !== "" && picked.kind !== null) {
    fields.push(picked.kind);
  }
  if (healthStr !== "" && picked.kind !== "health") fields.push("health");

  return { fields, healthStr, itemId, spellStr, statStr, upsDoneStr, upsTotalStr };
}
