/*
  Upgrade pair recovery. Tesseract often drops the `/` or reads it as `1`,
  gluing done+total (`2854028540`, `28540128540` on assets/Rarities/Common.png).
  A doubled digit on done that then exceeds total is the same class of misread.
*/

const LOOKALIKE: Record<string, string> = {
  b: "8",
  g: "9",
  i: "1",
  l: "1",
  o: "0",
  q: "9",
  s: "5",
  t: "7",
  z: "2",
};

const UPS_HEAD = /upgrades?\s*[:.]?\s*/i;
const NEXT_LABEL = /\s+(sell|req|health|physical|spell)\b/i;

export type UpgradePair = {
  readonly done: number | null;
  readonly total: number | null;
};

function digitsOf(raw: string): string {
  const mapped = raw.toLowerCase().replace(/[bgiloqstz]/g, (c) => LOOKALIKE[c] ?? c);
  return mapped.replace(/[^0-9]/g, "");
}

function asNumber(raw: string): number | null {
  const digits = digitsOf(raw);
  if (digits === "" || digits.length > 15) return null;
  return Number(digits);
}

/** Glue of two equal halves, optional `1` (slash lookalike) in the middle. */
function splitConcat(digits: string): readonly [string, string] | null {
  if (digits.length < 6) return null;
  if (digits.length % 2 === 0) {
    const mid = digits.length / 2;
    const left = digits.slice(0, mid);
    const right = digits.slice(mid);
    return left === right ? [left, right] : null;
  }
  const mid = Math.floor(digits.length / 2);
  const sep = digits[mid];
  if (sep !== "1") return null;
  const left = digits.slice(0, mid);
  const right = digits.slice(mid + 1);
  return left.length > 0 && left === right ? [left, right] : null;
}

/** done is one digit longer than total, exceeds it, and has a doubled digit. */
function undouble(done: number, total: number): number {
  if (done <= total) return done;
  const ds = String(done);
  const ts = String(total);
  if (ds.length !== ts.length + 1) return done;
  let best: number | null = null;
  for (let i = 0; i < ds.length - 1; i++) {
    const a = ds[i];
    const b = ds[i + 1];
    if (a === undefined || a !== b) continue;
    const next = Number(ds.slice(0, i) + ds.slice(i + 1));
    if (next > total) continue;
    if (next === total) return next;
    if (best === null || Math.abs(total - next) < Math.abs(total - best)) best = next;
  }
  return best ?? done;
}

function pair(done: number | null, total: number | null): UpgradePair {
  if (total === null || total <= 0) return { done, total: null };
  if (done === null) return { done: null, total };
  return { done: undouble(done, total), total };
}

export function preferUpgradePair(raw: UpgradePair, processed: UpgradePair): UpgradePair {
  const rawOk = raw.done !== null && raw.total !== null && raw.done <= raw.total;
  if (rawOk) return raw;
  const procOk = processed.done !== null && processed.total !== null && processed.done <= processed.total;
  if (procOk) return processed;
  return {
    done: raw.done ?? processed.done,
    total: raw.total ?? processed.total,
  };
}

export function parseUpgradePair(joined: string): UpgradePair {
  const head = UPS_HEAD.exec(joined);
  if (head === null) return { done: null, total: null };
  const rest = joined.slice(head.index + head[0].length);
  const cut = rest.search(NEXT_LABEL);
  const body = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  if (body === "") return { done: null, total: null };

  const slashAt = body.indexOf("/");
  if (slashAt !== -1) {
    return pair(asNumber(body.slice(0, slashAt)), asNumber(body.slice(slashAt + 1)));
  }

  const digits = digitsOf(body);
  if (digits === "" || digits.length > 15) return { done: null, total: null };
  const halves = splitConcat(digits);
  if (halves === null) return { done: null, total: null };
  return pair(Number(halves[0]), Number(halves[1]));
}
