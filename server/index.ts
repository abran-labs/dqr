/*
  DQR-Calc stats sidecar — Bun + bun:sqlite.

  Endpoints (prod: nginx proxies /api here; dev: astro.config.ts proxies /api):
    GET  /api/stats               -> aggregate counts for the site strip
    GET  /api/stats?stat=items    -> shields.io endpoint JSON
    GET  /api/stats?stat=accuracy -> shields.io endpoint JSON
    POST /api/events              -> { type: "calculation" } -> { id }
    POST /api/feedback            -> { calculationId, accurate } -> { success }

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

const PORT = Number(process.env.PORT ?? 4322);
const DB_PATH = resolve(process.env.DQR_STATS_DB ?? `${import.meta.dir}/data/stats.db`);
const IMAGES_DIR = resolve(`${import.meta.dir}/data/images`);
const EVENT_COOLDOWN_MS = 2_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(IMAGES_DIR, { recursive: true });

const db = new Database(DB_PATH, { create: true });
db.run(`
  CREATE TABLE IF NOT EXISTS calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accurate INTEGER,
    verification TEXT,
    ocr_raw_text TEXT,
    ocr_processed_text TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_calculations_accurate ON calculations(accurate);
`);
// Older databases predate the logging columns.
for (const column of ["ocr_raw_text TEXT", "ocr_processed_text TEXT"]) {
  try {
    db.run(`ALTER TABLE calculations ADD COLUMN ${column}`);
  } catch {
    // Column already exists.
  }
}

const insertCalculation = db.query(
  "INSERT INTO calculations (accurate, verification, ocr_raw_text, ocr_processed_text) VALUES (NULL, NULL, ?1, ?2)",
);
const countCalculations = db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM calculations");
const feedbackTotals = db.query<{ total: number; accurate: number }, []>(
  "SELECT COUNT(*) AS total, COALESCE(SUM(accurate), 0) AS accurate FROM calculations WHERE accurate IS NOT NULL",
);
const applyFeedback = db.query(
  "UPDATE calculations SET accurate = ?1 WHERE id = ?2 AND accurate IS NULL",
);

interface Aggregate {
  readonly itemsCalculated: number;
  readonly feedbackTotal: number;
  readonly feedbackAccurate: number;
  readonly accuracy: number | null;
}

const readAggregate = (): Aggregate => {
  const items = countCalculations.get()?.total ?? 0;
  const feedback = feedbackTotals.get();
  const feedbackTotal = feedback?.total ?? 0;
  const feedbackAccurate = feedback?.accurate ?? 0;
  return {
    accuracy: feedbackTotal > 0 ? Math.round((feedbackAccurate / feedbackTotal) * 1000) / 10 : null,
    feedbackAccurate,
    feedbackTotal,
    itemsCalculated: items,
  };
};

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
  const { lastInsertRowid } = insertCalculation.run(
    typeof rawText === "string" ? rawText : null,
    typeof processedText === "string" ? processedText : null,
  );
  const id = Number(lastInsertRowid);

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

  const { calculationId, accurate } = (body ?? {}) as Partial<Record<string, unknown>>;
  if (typeof calculationId !== "number" || !Number.isInteger(calculationId) || typeof accurate !== "boolean") {
    return json({ error: "Invalid request" }, 400);
  }

  const changed = applyFeedback.run(accurate ? 1 : 0, calculationId).changes;
  if (changed === 0) {
    return json({ error: "Unknown calculation or feedback already recorded" }, 404);
  }
  return json({ success: true });
};

const handleStats = (request: Request): Response => {
  const stat = new URL(request.url).searchParams.get("stat");
  const aggregate = readAggregate();

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
