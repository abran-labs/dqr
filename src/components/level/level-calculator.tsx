import * as React from "react";

import { LevelBoosts, XP_EVENTS, type XpBoostKey, type XpEventId } from "@/components/level/level-boosts";
import { LevelImagePasteZone } from "@/components/level/level-image-paste-zone";
import { LevelResult, type LevelResultData } from "@/components/level/level-result";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { parseXpText } from "@/lib/xp-extract";
import { dungeonChrome } from "@/lib/dungeon-display";
import { TRACK_CHROME } from "@/lib/item-tracks";
import {
  bossVisibleDifficulties,
  difficultyColor,
  difficultyLabel,
  DUNGEONS,
  findDungeon,
  resolveDifficulty,
} from "@/lib/xp-dungeons";
import {
  boostMultiplier,
  formatCompact,
  MAX_LEVEL,
  MIN_LEVEL,
  parseAmountInput,
  parseLevelInput,
  remainingXp,
  totalXp,
} from "@/lib/xp-math";
import { rankXpCandidates } from "@/lib/xp-ranking";
import { announceStatsUpdate, logLevelCalculation } from "@/lib/stats-client";
import {
  readLevelPreferences,
  readLevelPreview,
  writeLevelPreferences,
  writeLevelPreview,
} from "@/lib/xp-preferences";
import { cn } from "@/lib/utils";

const dungeonOptions: ComboboxOption[] = [...DUNGEONS].reverse().flatMap((dungeon) => {
  const chrome = dungeonChrome(dungeon.slug, dungeon.name);
  return bossVisibleDifficulties(dungeon.slug, dungeon.difficulties).map((entry) => {
    const label = difficultyLabel(entry.difficulty);
    return {
      color: difficultyColor(entry.difficulty),
      description: `${formatCompact(entry.experience)} XP`,
      group: dungeon.name,
      keywords: `${dungeon.name} ${label}`,
      label,
      value: `${dungeon.slug}:${entry.difficulty}`,
      ...(chrome.color === undefined ? {} : { groupColor: chrome.color }),
      ...(chrome.icon === undefined ? {} : { groupIcon: chrome.icon }),
    };
  });
});

function calculationKey(input: {
  readonly boosts: Record<XpBoostKey, boolean>;
  readonly currentXp: string;
  readonly difficulty: string;
  readonly dungeonSlug: string;
  readonly eventId: XpEventId;
  readonly fromLevel: string;
  readonly minutes: string;
  readonly toLevel: string;
}): string {
  return [
    input.fromLevel,
    input.toLevel,
    input.currentXp,
    input.minutes,
    input.dungeonSlug,
    input.difficulty,
    input.eventId,
    JSON.stringify(input.boosts),
  ].join(":");
}

function LevelInput({ id, label, value, error, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error?: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      <Input
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        aria-invalid={error === undefined ? undefined : true}
        className={cn(error !== undefined && "border-destructive")}
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value.replace(/\D+/g, ""))}
        value={value}
      />
      {error !== undefined && <p className="text-sm text-destructive" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function LevelCalculator() {
  const [fromLevel, setFromLevel] = React.useState("");
  const [toLevel, setToLevel] = React.useState("");
  const [currentXp, setCurrentXp] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [eventId, setEventId] = React.useState<XpEventId>("none");
  const [scanRevision, setScanRevision] = React.useState(0);
  const [scanWarning, setScanWarning] = React.useState<string | null>(null);
  const [dungeonSlug, setDungeonSlug] = React.useState("gilded-skies");
  const [difficulty, setDifficulty] = React.useState("");
  const [boosts, setBoosts] = React.useState<Record<XpBoostKey, boolean>>({
    hardcore: false,
    solo: false,
    vip: false,
    xpBoost: false,
  });
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = React.useState(false);
  const [logRetry, setLogRetry] = React.useState(0);
  const revisionRef = React.useRef(scanRevision);
  const loggedCalculationKey = React.useRef<string | null>(null);
  const loggingKeyRef = React.useRef<string | null>(null);
  const loggingAttemptsRef = React.useRef(0);
  revisionRef.current = scanRevision;

  React.useEffect(() => {
    const preferences = readLevelPreferences(window.localStorage);
    setFromLevel(preferences.fromLevel);
    setToLevel(preferences.toLevel);
    setCurrentXp(preferences.currentXp);
    setMinutes(preferences.minutes);
    setEventId(preferences.eventId);
    setBoosts(preferences.boosts);
    setDungeonSlug(preferences.dungeonSlug);
    setDifficulty(preferences.difficulty);
    setScanWarning(preferences.scanWarning);
    setPreviewDataUrl(readLevelPreview(window.localStorage));
    loggedCalculationKey.current = calculationKey(preferences);
    setPreferencesReady(true);
  }, []);
  React.useEffect(() => {
    if (!preferencesReady) return;
    writeLevelPreferences(window.localStorage, {
      boosts,
      currentXp,
      difficulty,
      dungeonSlug,
      eventId,
      fromLevel,
      minutes,
      scanWarning,
      toLevel,
    });
  }, [
    preferencesReady,
    boosts,
    currentXp,
    difficulty,
    dungeonSlug,
    eventId,
    fromLevel,
    minutes,
    scanWarning,
    toLevel,
  ]);

  const from = parseLevelInput(fromLevel, MIN_LEVEL, MAX_LEVEL - 1);
  const to = parseLevelInput(toLevel, MIN_LEVEL + 1, MAX_LEVEL);
  const xp = parseAmountInput(currentXp);
  const pace = minutes.trim() === "" ? null : parseAmountInput(minutes);
  const eventBoost = XP_EVENTS.find((event) => event.value === eventId)?.boost ?? 0;
  const rangeError = fromLevel === "" || toLevel === "" ? undefined : !Number.isFinite(from) || !Number.isFinite(to)
    ? `Enter levels ${MIN_LEVEL}–${MAX_LEVEL}.`
    : to <= from ? "Target level must be higher than current level." : undefined;
  const xpError = Number.isFinite(xp) ? undefined : "Enter a valid XP amount (K, M, B, T, Q suffixes work).";
  const paceError = pace === null || Number.isFinite(pace) ? undefined : "Enter a valid number of minutes.";
  const valid = fromLevel !== "" && toLevel !== "" && rangeError === undefined && xpError === undefined && paceError === undefined;
  const candidates = React.useMemo(() => valid
    ? rankXpCandidates({ boosts: { ...boosts, eventBoost }, currentXp: xp, fromLevel: from, minutesPerRun: pace, toLevel: to })
    : [], [valid, boosts, eventBoost, xp, from, pace, to]);
  const dungeon = findDungeon(dungeonSlug);
  const selectedDifficulty = resolveDifficulty(dungeon, difficulty);
  const selected = candidates.find((candidate) => candidate.dungeonSlug === dungeonSlug && candidate.difficulty === selectedDifficulty?.difficulty && candidate.eligible) ?? null;
  const selectedError = candidates.find((candidate) => candidate.dungeonSlug === dungeonSlug && !candidate.eligible)?.reason ?? null;
  const activeMultiplier = selected?.multiplier ?? boostMultiplier({ ...boosts, eventBoost, xpBoost: from < 180 || boosts.xpBoost });
  const selectedDungeonLabel = dungeon?.name ?? "Pick a dungeon";
  const selectedDungeonColor = dungeonChrome(dungeonSlug, dungeon?.name ?? "").color ?? TRACK_CHROME.spell;
  const selectedDifficultyLabel = selectedDifficulty === undefined ? "Select difficulty" : difficultyLabel(selectedDifficulty.difficulty);
  const selectedDifficultyAccent = selectedDifficulty === undefined ? "#A1A1AA" : difficultyColor(selectedDifficulty.difficulty);
  const requiredXp = valid ? totalXp(from, to) : 0;
  const remainder = valid ? remainingXp(from, to, xp) : 0;
  const result: LevelResultData | null = selected === null ? null : {
    title: `Level ${from} → ${to}`,
    color: dungeonChrome(selected.dungeonSlug, selected.dungeonName).color ?? TRACK_CHROME.spell,
    minutes: pace,
    remainingXp: remainder,
    runs: selected.runs,
    totalXp: requiredXp,
    xpPerRun: selected.xpPerRun,
  };

  React.useEffect(() => {
    if (result === null) return;
    const key = calculationKey({ boosts, currentXp, difficulty, dungeonSlug, eventId, fromLevel, minutes, toLevel });
    if (loggedCalculationKey.current === key) return;
    if (loggingKeyRef.current !== key) {
      loggingKeyRef.current = key;
      loggingAttemptsRef.current = 0;
    }
    const timer = setTimeout(() => {
      void logLevelCalculation().then((id) => {
        if (id !== null) {
          if (loggingKeyRef.current === key) {
            loggedCalculationKey.current = key;
            announceStatsUpdate();
          }
          return;
        }
        if (loggingKeyRef.current === key && loggingAttemptsRef.current < 2) {
          loggingAttemptsRef.current += 1;
          setLogRetry((current) => current + 1);
        }
      });
    }, 2200);
    return () => clearTimeout(timer);
  }, [result, boosts, currentXp, difficulty, dungeonSlug, eventId, fromLevel, minutes, toLevel, logRetry]);

  const handlePreviewChange = React.useCallback((dataUrl: string | null) => {
    setPreviewDataUrl(dataUrl);
    writeLevelPreview(window.localStorage, dataUrl);
  }, []);
  const handleScan = React.useCallback((text: string, revision: number): string | null => {
    if (revision !== revisionRef.current) return "Inputs changed while scanning; try the screenshot again.";
    const result = parseXpText(text);
    if (result.kind === "error") return result.message;
    if (result.level !== null) {
      setFromLevel(String(result.level));
      setToLevel(String(result.level + 1));
    }
    setCurrentXp(result.currentXp);
    setScanWarning(result.warning);
    setScanRevision((current) => current + 1);
    return null;
  }, []);
  const editFrom = (value: string) => {
    setFromLevel(value);
    setScanWarning(null);
    setScanRevision((current) => current + 1);
  };
  const editXp = (value: string) => {
    setCurrentXp(value);
    setScanWarning(null);
    setScanRevision((current) => current + 1);
  };
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
            <LevelImagePasteZone
              initialPreviewUrl={previewDataUrl}
              onPreviewChange={handlePreviewChange}
              onScan={handleScan}
              revision={scanRevision}
            />
            {scanWarning !== null && <p className="text-sm text-yellow-400" role="status">{scanWarning}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <LevelInput id="from-level" label="From level" onChange={editFrom} value={fromLevel} />
              <LevelInput id="to-level" label="To level" error={rangeError} onChange={setToLevel} value={toLevel} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="current-xp">Current XP</label>
              <Input id="current-xp" onChange={(event) => editXp(event.target.value)} value={currentXp} />
              {xpError !== undefined && <p className="text-sm text-destructive">{xpError}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="minutes-run">Minutes per run <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="minutes-run" inputMode="decimal" onChange={(event) => setMinutes(event.target.value)} value={minutes} />
              {paceError !== undefined && <p className="text-sm text-destructive">{paceError}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="xp-dungeon">Dungeon</label>
              <Combobox
                id="xp-dungeon"
                onChange={(value) => {
                  const [nextDungeon, nextDifficulty] = value.split(":");
                  setDungeonSlug(nextDungeon ?? "");
                  setDifficulty(nextDifficulty ?? "");
                }}
                options={dungeonOptions}
                placeholder="Pick a dungeon"
                searchPlaceholder="Search dungeons or difficulties…"
                value={`${dungeonSlug}:${selectedDifficulty?.difficulty ?? ""}`}
                valueParts={[
                  { color: selectedDungeonColor, text: selectedDungeonLabel },
                  { color: "#71717A", text: " · " },
                  { color: selectedDifficultyAccent, text: selectedDifficultyLabel },
                ]}
              />
              {selectedError !== null && <p className="text-sm text-destructive" role="alert">{selectedError}</p>}
            </div>
      <LevelBoosts
        boosts={boosts}
        eventId={eventId}
        fromLevel={from}
        multiplier={activeMultiplier}
        onBoost={(key) => setBoosts((current) => ({ ...current, [key]: !current[key] }))}
        onEvent={setEventId}
      />
      <LevelResult result={result} />
      </CardContent>
    </Card>
  );
}
