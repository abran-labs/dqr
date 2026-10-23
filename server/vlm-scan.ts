/*
  Vision-model tooltip read via OpenRouter. The key comes from
  OPENROUTER_API_KEY (project-root .env, which Bun loads, or the process env); without it the
  endpoint reports unavailable and the client falls back to Tesseract.
*/

const MODEL = process.env.DQR_VLM_MODEL ?? "anthropic/claude-haiku-5.5";
const TIMEOUT_MS = 30_000;

const PROMPT = `This is a Dungeon Quest Reborn item tooltip screenshot. Read it exactly and reply with ONLY a JSON object:
{"name": string, "physical": number|null, "spell": number|null, "health": number|null, "upgradesDone": number|null, "upgradesTotal": number|null}
- name: the title text exactly as shown.
- physical/spell/health: the stat values with no separators or suffixes; null if the tooltip has no such stat.
- upgradesDone/upgradesTotal: from the "Upgrades: done/total" style line; total is the max (can be a large number like 412619).
Copy digits carefully; do not guess.`;

export interface VlmRead {
  readonly name: string | null;
  readonly physical: number | null;
  readonly spell: number | null;
  readonly health: number | null;
  readonly upsDone: number | null;
  readonly upsTotal: number | null;
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
    name,
    physical: toCount(parsed.physical),
    spell: toCount(parsed.spell),
    upsDone: toCount(parsed.upgradesDone),
    upsTotal: toCount(parsed.upgradesTotal),
  };
}
