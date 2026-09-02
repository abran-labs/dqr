/*
  DQR-Calc stats sidecar — Bun + bun:sqlite.

  Endpoints (prod: nginx proxies /api here; dev: astro.config.ts proxies /api):
    GET  /api/stats               -> aggregate counts for the site strip
    GET  /api/stats?stat=items    -> shields.io endpoint JSON
    GET  /api/stats?stat=accuracy -> shields.io endpoint JSON
    POST /api/events              -> { type: "calculation" } -> { id }
    POST /api/feedback            -> { calculationId, field, accurate } -> { success }

  Run: bun run server/index.ts   (script `bun run stats`)

  The `verification` column is reserved for a future verification layer
  (e.g. an LLM double-check of the OCR read). Nothing writes it today;
  a verifier would fill it alongside the user's answer.

  Every calculation logs its inputs for future re-verification:
  - data/images/{id}.png — the upscaled image the OCR read
  - ocr_raw_text / ocr_processed_text — both OCR passes
*/

import { mkdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Database } from "bun:sqlite";

import { parseFeedbackPayload } from "../src/lib/autofill-feedback";
import { openStatsStore } from "./stats-store";

const PORT = Number(process.env.PORT ?? 4322);
const DB_PATH = resolve(process.env.DQR_STATS_DB ?? `${import.meta.dir}/data/stats.db`);
const IMAGES_DIR = resolve(`${import.meta.dir}/data/images`);
const EVENT_COOLDOWN_MS = 2_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(IMAGES_DIR, { recursive: true });

const store = openStatsStore(new Database(DB_PATH, { create: true }));

function assertNever(value: never): never {
  throw new Error(`unexpected: ${String(value)}`);
}

const shields = (label: string, message: string, color: string) => ({
  schemaVersion: 1,
  label,
  message,
  color,
});

const accuracyColor = (accuracy: number): string => {
  if (accuracy >= 95) return "green";
  if (accuracy >= 80) return "yellow";
  return "red";
};

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    status,
  });

// Anonymous public endpoint — a light in-memory cooldown keeps trivial
// counter inflation away. Resets on restart; acceptable for public counters.
const lastEventAt = new Map<string, number>();

const clientKey = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
};

const handleEvents = async (request: Request): Promise<Response> => {
  const key = clientKey(request);
  const now = Date.now();
  const last = lastEventAt.get(key);
  if (last !== undefined && now - last < EVENT_COOLDOWN_MS) {
    return json({ error: "Too soon after the previous calculation" }, 429);
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { image, processedText, rawText } = (body ?? {}) as Partial<Record<string, unknown>>;
  if (image !== undefined && typeof image !== "string") {
    return json({ error: "Invalid request" }, 400);
  }

  // Optional PNG/JPEG/WebP data URL of the upscaled OCR input. Saved to disk so
  // past reads can be re-verified when a verification layer exists.
  const dataUrlMatch = typeof image === "string" ? image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/) : null;
  if (typeof image === "string" && image.length > 0 && !dataUrlMatch) {
    return json({ error: "Image must be a base64 png/jpeg/webp data URL" }, 400);
  }
  const imageBytes = dataUrlMatch ? Buffer.from(dataUrlMatch[2] ?? "", "base64") : null;
  if (imageBytes !== null && imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return json({ error: "Image too large" }, 413);
  }

  lastEventAt.set(key, now);
  const id = store.insertCalculation(
    typeof rawText === "string" ? rawText : null,
    typeof processedText === "string" ? processedText : null,
  );

  if (imageBytes !== null && dataUrlMatch !== null) {
    const extension = dataUrlMatch[1] === "jpeg" ? "jpg" : (dataUrlMatch[1] ?? "png");
    writeFileSync(`${IMAGES_DIR}/${id}.${extension}`, imageBytes);
  }
  return json({ id });
};

const handleFeedback = async (request: Request): Promise<Response> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseFeedbackPayload(body);
  if (parsed === null) {
    return json({ error: "Invalid request" }, 400);
  }

  const result = store.applyFieldFeedback(parsed.calculationId, parsed.field, parsed.accurate);
  switch (result) {
    case "ok":
      return json({ success: true });
    case "duplicate":
    case "missing":
      return json({ error: "Unknown calculation or feedback already recorded" }, 404);
    default:
      return assertNever(result);
  }
};

const handleStats = (request: Request): Response => {
  const stat = new URL(request.url).searchParams.get("stat");
  const aggregate = store.readAggregate();

  if (stat === "items") {
    return json(shields("items calculated", aggregate.itemsCalculated.toLocaleString("en-US"), "orange"));
  }
  if (stat === "accuracy") {
    if (aggregate.accuracy === null) {
      return json(shields("ocr accuracy", "no ratings", "gray"));
    }
    return json(shields("ocr accuracy", `${aggregate.accuracy}%`, accuracyColor(aggregate.accuracy)));
  }

  const response = json(aggregate);
  // Public counters; short shared cache keeps the strip + shields cheap.
  response.headers.set("Cache-Control", "public, max-age=30");
  return response;
};

Bun.serve({
  async fetch(request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/api/events" && request.method === "POST") {
      return handleEvents(request);
    }
    if (pathname === "/api/feedback" && request.method === "POST") {
      return handleFeedback(request);
    }
    if (pathname === "/api/stats" && request.method === "GET") {
      return handleStats(request);
    }
    return json({ error: "Not found" }, 404);
  },
  port: PORT,
});

console.log(`[dqr-stats] listening on :${PORT} (db: ${DB_PATH})`);
