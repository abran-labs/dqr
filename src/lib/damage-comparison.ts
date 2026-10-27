const DAMAGE_COMPARISON_EVENT = "dqr:damage-comparison";

let average: number | null = null;

export function readDamageAverage(): number | null {
  return average;
}

export function publishDamageAverage(next: number | null): void {
  average = next;
  window.dispatchEvent(new Event(DAMAGE_COMPARISON_EVENT));
}

export function subscribeDamageAverage(listener: (next: number | null) => void): () => void {
  const sync = () => listener(average);
  window.addEventListener(DAMAGE_COMPARISON_EVENT, sync);
  return () => window.removeEventListener(DAMAGE_COMPARISON_EVENT, sync);
}
