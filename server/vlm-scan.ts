/*
  Vision-model tooltip read via OpenRouter. The key comes from
  OPENROUTER_API_KEY (project-root .env, which Bun loads, or the process env); without it the
  endpoint reports unavailable and the client falls back to Tesseract.
*/

const MODEL = process.env.DQR_VLM_MODEL ?? "anthropic/claude-haiku-5.5";
const TIMEOUT_MS = 30_000;

const PROMPT = `This is a Dungeon Quest Reborn item tooltip screenshot. Read it exactly and reply with ONLY a JSON object:
{"name": string, "rarity": "common"|"uncommon"|"rare"|"epic"|"legendary"|"ultimate"|null, "physical": number|null, "spell": number|null, "health": number|null, "upgradesDone": number|null, "upgradesTotal": number|null}
- rarity: the tooltip card's background tint: gray=common, green=uncommon, blue=rare, purple=epic, yellow/gold/orange=legendary, red=ultimate. null if you cannot tell.
- name: the title text exactly as shown.
- physical/spell/health: the stat values with no separators or suffixes; null if the tooltip has no such stat.
- upgradesDone/upgradesTotal: from the "Upgrades: done/total" style line; total is the max (can be a large number like 412619).
Copy digits carefully; do not guess. If the upgrades text is too small or blurry to read every digit with confidence, return null for the one(s) you cannot read instead of a best guess.

The image may instead be the in-game upgrade screen: an item name plate, "Upgrades: done/total", and a left panel saying "It will have N power when maxed." and "It is recommended to upgrade X power." In that case also add:
"maxPower": N as a number (null if absent), "recommended": "physical"|"spell"|"health"|null, and "plateBox": [x0, y0, x1, y1] as fractions 0-1 of the image width/height tightly around the item icon box plus the item name plate under/next to it (null if not an upgrade screen).
For the upgrade screen, "rarity" is the tint of the item icon box and name plate at the top of the right panel (same color mapping; ignore the gray side panels and the colored buttons). Use the plate name for "name" and the Upgrades line for upgradesDone/upgradesTotal; leave physical/spell/health null.`;

export interface VlmRead {
  readonly name: string | null;
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
  /** Upgrade-screen "It will have N power when maxed" — equals the pot. */
  readonly maxPower: number | null;
  readonly recommended: "physical" | "spell" | "health" | null;
  /** Normalized box around the icon + name plate; rarity is sampled from it. */
  readonly rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "ultimate" | null;
  readonly plateBox: readonly [number, number, number, number] | null;
}

const RARITY_NAMES = ["common", "uncommon", "rare", "epic", "legendary", "ultimate"] as const;

function toBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const n = value.map((v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : Number.NaN));
  const [a, b, c, d] = n;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  if ([a, b, c, d].some(Number.isNaN) || c - a < 0.05 || d - b < 0.03) return null;
  return [a, b, c, d];
}

const toCount = (value: unknown): number | null => {
  const n = typeof value === "string" && /^[\d,.\s]+$/.test(value) ? Number(value.replace(/[,.\s]/g, "")) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

export const vlmAvailable = (): boolean => Boolean(process.env.OPENROUTER_API_KEY);

export async function readTooltipWithVlm(imageDataUrl: string): Promise<VlmRead | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    body: JSON.stringify({
      max_tokens: 1000,
      messages: [
        {
          content: [
            { text: PROMPT, type: "text" },
            { image_url: { url: imageDataUrl }, type: "image_url" },
          ],
          role: "user",
        },
      ],
      model: MODEL,
      temperature: 0,
    }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = data.choices?.[0]?.message?.content;
  const match = typeof text === "string" ? text.match(/\{[\s\S]*\}/) : null;
  if (match === null) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = typeof parsed.name === "string" && parsed.name.trim() !== "" ? parsed.name.trim() : null;
  return {
    health: toCount(parsed.health),
    maxPower: toCount(parsed.maxPower),
    name,
    plateBox: toBox(parsed.plateBox),
    rarity: RARITY_NAMES.find((r) => r === parsed.rarity) ?? null,
    physical: toCount(parsed.physical),
    recommended:
      parsed.recommended === "physical" || parsed.recommended === "spell" || parsed.recommended === "health"
        ? parsed.recommended
        : null,
    spell: toCount(parsed.spell),
    upsDone: toCount(parsed.upgradesDone),
    upsTotal: toCount(parsed.upgradesTotal),
  };
}
