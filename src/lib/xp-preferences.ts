export type XpEventId = "none" | "2x" | "1.5x";

export interface LevelPreferences {
  readonly boosts: {
    readonly vip: boolean;
    readonly solo: boolean;
    readonly hardcore: boolean;
    readonly xpBoost: boolean;
  };
  readonly currentXp: string;
  readonly difficulty: string;
  readonly dungeonSlug: string;
  readonly eventId: XpEventId;
  readonly fromLevel: string;
  readonly minutes: string;
  readonly scanWarning: string | null;
  readonly toLevel: string;
}

export const LEVEL_PREFERENCES_KEY = "dqr:level-preferences:v1";
export const LEVEL_PREVIEW_KEY = "dqr:level-preview:v1";
export const DEFAULT_LEVEL_PREFERENCES: LevelPreferences = {
  boosts: { hardcore: false, solo: false, vip: false, xpBoost: false },
  currentXp: "",
  difficulty: "",
  dungeonSlug: "gilded-skies",
  eventId: "none",
  fromLevel: "",
  minutes: "",
  scanWarning: null,
  toLevel: "",
};

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseLevelPreferences(raw: unknown): LevelPreferences {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) return DEFAULT_LEVEL_PREFERENCES;
      throw error;
    }
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.boosts)) return DEFAULT_LEVEL_PREFERENCES;
  const eventId = value.eventId === "2x" || value.eventId === "1.5x" ? value.eventId : "none";
  return {
    boosts: {
      hardcore: value.boosts.hardcore === true,
      solo: value.boosts.solo === true,
      vip: value.boosts.vip === true,
      xpBoost: value.boosts.xpBoost === true,
    },
    currentXp: typeof value.currentXp === "string" ? value.currentXp : "",
    difficulty: typeof value.difficulty === "string" ? value.difficulty : "",
    dungeonSlug: typeof value.dungeonSlug === "string" && value.dungeonSlug !== ""
      ? value.dungeonSlug
      : DEFAULT_LEVEL_PREFERENCES.dungeonSlug,
    eventId,
    fromLevel: typeof value.fromLevel === "string" ? value.fromLevel : "",
    minutes: typeof value.minutes === "string" ? value.minutes : "",
    scanWarning: typeof value.scanWarning === "string" ? value.scanWarning : null,
    toLevel: typeof value.toLevel === "string" ? value.toLevel : "",
  };
}

export function readLevelPreferences(store: KeyValueStore): LevelPreferences {
  try {
    return parseLevelPreferences(store.getItem(LEVEL_PREFERENCES_KEY));
  } catch {
    // no-excuse-ok: catch — preferences are optional browser state.
    return DEFAULT_LEVEL_PREFERENCES;
  }
}

export function writeLevelPreferences(store: KeyValueStore, preferences: LevelPreferences): boolean {
  try {
    store.setItem(LEVEL_PREFERENCES_KEY, JSON.stringify({ ...preferences, version: 1 }));
    return true;
  } catch {
    // no-excuse-ok: catch — denied storage must not break calculation.
    return false;
  }
}

export function readLevelPreview(store: KeyValueStore): string | null {
  try {
    const preview = store.getItem(LEVEL_PREVIEW_KEY);
    return preview?.startsWith("data:image/") === true ? preview : null;
  } catch {
    // no-excuse-ok: catch — preview storage is optional browser state.
    return null;
  }
}

export function writeLevelPreview(store: KeyValueStore, preview: string | null): boolean {
  try {
    store.setItem(LEVEL_PREVIEW_KEY, preview ?? "");
    return true;
  } catch {
    // no-excuse-ok: catch — denied storage must not break screenshot scanning.
    return false;
  }
}
