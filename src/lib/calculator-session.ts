import type { AutofillField } from "./autofill-feedback";
import type { Rarity } from "./dqr-items";
import type { ExtractedTooltip } from "./ocr-extract";
import type { TooltipScan } from "./ocr";

export interface CalculatorSession {
  readonly scan: TooltipScan | null;
  readonly extract: ExtractedTooltip | null;
  readonly calculationId: number | null;
  readonly itemId: string;
  readonly manualRarity: Rarity | null;
  readonly statStr: string;
  readonly spellStr: string;
  readonly upsDoneStr: string;
  readonly upsTotalStr: string;
  readonly healthStr: string;
  readonly autofilled: readonly AutofillField[];
  readonly scanGen: number;
}

let session: CalculatorSession | null = null;

export function readCalculatorSession(): CalculatorSession | null {
  return session;
}

export function writeCalculatorSession(next: CalculatorSession | null): void {
  session = next;
}
