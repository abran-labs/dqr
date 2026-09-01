export const CALCULATOR_RESET_EVENT = "dqr:calculator-reset";

export function requestCalculatorReset(): void {
  document.dispatchEvent(new Event(CALCULATOR_RESET_EVENT));
}
