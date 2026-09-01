import * as React from "react";

import { ImagePasteZone } from "@/components/calculator/image-paste-zone";
import { ResultPanel } from "@/components/calculator/result-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUNGEONS, ITEMS, RARITY_INFO, type DqrItem, type ItemClass, type ItemRarityRow, type Rarity } from "@/lib/dqr-items";
import { buildDiscordText } from "@/lib/discord-copy";
import { itemTracks, TRACK_CHROME } from "@/lib/item-tracks";
import {
  calculatePotential,
  healthRange,
  potentialPercentile,
  resolveRarityRows,
  statRange,
  upsRange,
  type NumberRange,
} from "@/lib/pot-utils";
import { type TooltipScan } from "@/lib/ocr";
import { extractTooltip, type ExtractedTooltip } from "@/lib/ocr-extract";
import { pickTooltipStat, statFieldLabel } from "@/lib/ocr-stat";
import { CALCULATOR_RESET_EVENT } from "@/lib/calculator-reset";
import { announceStatsUpdate, logCalculation, submitFeedback } from "@/lib/stats-client";

/*
  Calculator island — AbyssFishLog-style form (docs/ai/design-system.md):
  fields stacked one under another, ranges as placeholders, live validation,
  auto-calculation (no button). Resolution flow: docs/Info/Item-Data.md.
*/

const CLASS_LABEL: Record<ItemClass, string> = {
  dps: "DPS armor",
  guardian: "Guardian armor",
  hybrid: "Hybrid",
  mage: "Mage",
  war: "Warrior",
};

const DUNGEON_BY_CODE = new Map(DUNGEONS.map((dungeon) => [dungeon.code, dungeon] as const));

const fmt = (value: number): string => value.toLocaleString("en-US");

const parseNumber = (value: string): number | null => {
  const cleaned = value.replace(/[,_\s]/g, "");
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
};

const itemOptions: ComboboxOption[] = ITEMS.map((item) => {
  const dungeon = DUNGEON_BY_CODE.get(item.dungeon);
  const single = item.rows.length === 1;
  return {
    ...(single ? { color: RARITY_INFO[item.maxRarity].color } : {}),
    description: `${single ? `${RARITY_INFO[item.maxRarity].label} · ` : ""}${CLASS_LABEL[item.class]}${item.glitched ? " · glitched" : ""}${item.rows.length === 0 ? " · no data yet" : ""}`,
    group: dungeon?.name ?? item.dungeon,
    ...(dungeon === undefined ? {} : { groupColor: dungeon.color }),
    groupIcon: `/dungeons/${item.dungeon}.webp`,
    keywords: item.dungeon,
    label: item.name,
    value: item.id,
  };
});

interface CalcResult {
  readonly item: DqrItem;
  readonly row: ItemRarityRow;
  readonly pot: number;
  readonly percentile: number;
}

export function CalculatorApp() {
  const [scan, setScan] = React.useState<TooltipScan | null>(null);
  const [extract, setExtract] = React.useState<ExtractedTooltip | null>(null);
  const [calculationId, setCalculationId] = React.useState<number | null>(null);

  const [itemId, setItemId] = React.useState<string>("");
  const [manualRarity, setManualRarity] = React.useState<Rarity | null>(null);
  const [statStr, setStatStr] = React.useState("");
  const [spellStr, setSpellStr] = React.useState("");
  const [upsDoneStr, setUpsDoneStr] = React.useState("");
  const [upsTotalStr, setUpsTotalStr] = React.useState("");
  const [healthStr, setHealthStr] = React.useState("");

  const [feedbackSent, setFeedbackSent] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pasteGeneration, setPasteGeneration] = React.useState(0);
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = React.useMemo(() => ITEMS.find((i) => i.id === itemId), [itemId]);
  const pickedStat = React.useMemo(
    () => (extract === null ? null : pickTooltipStat(extract, item ?? null)),
    [extract, item],
  );
  const statLabel = statFieldLabel(item ?? null, pickedStat?.kind ?? null);

  const handleScan = React.useCallback((next: TooltipScan): boolean => {
    const ex = extractTooltip(next);
    const filled =
      ex.item !== null ||
      [ex.physical, ex.spell, ex.health, ex.upsDone, ex.upsTotal].some((v) => v !== null);
    // Wrong image: don't log (counter stays put), don't wipe a previous fill.
    if (!filled) return false;

    setScan(next);
    setFeedbackSent(null);
    setExtract(ex);
    const picked = pickTooltipStat(ex, ex.item);
    const bounds = ex.item ? statRange(ex.item.rows) : null;
    const inBounds = (value: number | null): value is number =>
      value !== null && (bounds === null || (value >= bounds.min && value <= bounds.max));
    setItemId(ex.item?.id ?? "");
    setManualRarity(next.rarity);
    if (ex.item?.class === "hybrid") {
      setStatStr(inBounds(ex.physical) ? String(ex.physical) : "");
      setSpellStr(inBounds(ex.spell) ? String(ex.spell) : "");
    } else {
      setStatStr(picked.value !== null ? String(picked.value) : "");
      setSpellStr("");
    }
    setUpsDoneStr(ex.upsDone !== null ? String(ex.upsDone) : "");
    setUpsTotalStr(ex.upsTotal !== null ? String(ex.upsTotal) : "");
    setHealthStr(ex.health !== null ? String(ex.health) : "");
    return true;
  }, []);

  const handleItemChange = (nextId: string) => {
    setItemId(nextId);
    if (!scan?.rarity) setManualRarity(null);
  };

  // Live ranges + per-field validation (an out-of-range read is a misread —
  // the same check OCR auto-fill will use).
  const fields = React.useMemo(() => {
    const total = parseNumber(upsTotalStr);
    const done = parseNumber(upsDoneStr);
    const stat = parseNumber(statStr);
    const spell = parseNumber(spellStr);
    const health = parseNumber(healthStr);
    const rows = item?.rows ?? [];
    const ranges: { total: NumberRange | null; stat: NumberRange | null; health: NumberRange | null } = {
      total: upsRange(rows),
      stat: statRange(rows, done ?? undefined),
      health: healthRange(rows),
    };
    const errors: { total?: string; done?: string; stat?: string; spell?: string; health?: string } = {};
    if (item && total !== null && ranges.total && (total < ranges.total.min || total > ranges.total.max)) {
      errors.total = `Total upgrades must be between ${fmt(ranges.total.min)} - ${fmt(ranges.total.max)}`;
    }
    if (done !== null && total !== null && done > total) {
      errors.done = "Upgrades can't exceed total upgrades.";
    }
    if (item && stat !== null && ranges.stat && (stat < ranges.stat.min || stat > ranges.stat.max)) {
      errors.stat = `${statLabel} must be between ${fmt(ranges.stat.min)} - ${fmt(ranges.stat.max)}`;
    }
    if (item && spell !== null && ranges.stat && (spell < ranges.stat.min || spell > ranges.stat.max)) {
      errors.spell = `Spell Power must be between ${fmt(ranges.stat.min)} - ${fmt(ranges.stat.max)}`;
    }
    if (health !== null && ranges.health && (health < ranges.health.min || health > ranges.health.max)) {
      errors.health = `Health must be between ${fmt(ranges.health.min)} - ${fmt(ranges.health.max)}`;
    }
    return { done, errors, health, ranges, spell, stat, total };
  }, [item, statStr, spellStr, upsDoneStr, upsTotalStr, healthStr, statLabel]);

  // Auto-resolution — runs on every keystroke, no calculate button.
  const resolution = React.useMemo(() => {
    if (!item) return { status: "empty" as const };
    if (item.rows.length === 0) return { status: "no-data" as const };
    const { done, errors, health, spell, stat, total } = fields;
    const hybrid = item.class === "hybrid";
    const primary = hybrid ? (stat ?? spell) : stat;
    if (primary === null || done === null || total === null) return { status: "empty" as const };
    if (errors.total || errors.done || errors.stat || errors.spell || errors.health) {
      return { status: "invalid" as const };
    }

    const pot = calculatePotential(primary, done, total);
    const survivors = resolveRarityRows(item, { health: health ?? undefined, pot, upgradesTotal: total });
    if (survivors.length === 0) return { status: "no-fit" as const };
    if (manualRarity) {
      const chosen = survivors.find((row) => row.rarity === manualRarity);
      if (chosen) return { status: "ok" as const, row: chosen, pot };
    }
    if (survivors.length === 1) {
      return { status: "ok" as const, row: survivors[0] as ItemRarityRow, pot };
    }
    return { status: "ambiguous" as const, survivors, pot };
  }, [item, fields, manualRarity]);

  const result: CalcResult | null =
    item && resolution.status === "ok"
      ? {
          item,
          percentile: potentialPercentile(resolution.pot, resolution.row),
          pot: resolution.pot,
          row: resolution.row,
        }
      : null;
  const displayName =
    extract?.item?.id === itemId && extract.title ? extract.title : (item?.name ?? "");
  const tracks = result
    ? itemTracks({
        health: fields.health,
        hybrid:
          result.item.class === "hybrid" && fields.done !== null && fields.total !== null
            ? {
                physical:
                  fields.stat === null
                    ? null
                    : {
                        percentile: potentialPercentile(
                          calculatePotential(fields.stat, fields.done, fields.total),
                          result.row,
                        ),
                        pot: calculatePotential(fields.stat, fields.done, fields.total),
                      },
                spell:
                  fields.spell === null
                    ? null
                    : {
                        percentile: potentialPercentile(
                          calculatePotential(fields.spell, fields.done, fields.total),
                          result.row,
                        ),
                        pot: calculatePotential(fields.spell, fields.done, fields.total),
                      },
              }
            : null,
        itemClass: result.item.class,
        offense: pickedStat?.kind === "spell" || result.item.class === "mage" ? "spell" : "physical",
        percentile: result.percentile,
        pot: result.pot,
        row: result.row,
      })
    : [];
  const scanRarity = scan?.rarity;
  const previewRarity =
    result?.row.rarity ??
    manualRarity ??
    (scanRarity !== undefined &&
    scanRarity !== null &&
    item?.rows.some((row) => row.rarity === scanRarity)
      ? scanRarity
      : null);

  // Count only when the result panel is up, once per item — typing more
  // numbers on the same item is still one calculation.
  const loggedItemId = React.useRef<string | null>(null);

  const resetCalculator = React.useCallback(() => {
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
    loggedItemId.current = null;
    setScan(null);
    setExtract(null);
    setCalculationId(null);
    setItemId("");
    setManualRarity(null);
    setStatStr("");
    setSpellStr("");
    setUpsDoneStr("");
    setUpsTotalStr("");
    setHealthStr("");
    setFeedbackSent(null);
    setCopied(false);
    setPasteGeneration((generation) => generation + 1);
  }, []);

  React.useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetCalculator();
    };
    document.addEventListener(CALCULATOR_RESET_EVENT, resetCalculator);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener(CALCULATOR_RESET_EVENT, resetCalculator);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [resetCalculator]);
  React.useEffect(() => {
    if (!item) {
      loggedItemId.current = null;
      return;
    }
    if (!result || loggedItemId.current === item.id) return;
    loggedItemId.current = item.id;
    setFeedbackSent(null);
    const payload = scan ?? { imageDataUrl: null, nameText: "", processedText: "", rarity: null, rawText: "" };
    void logCalculation(payload).then((id) => {
      if (id !== null) {
        setCalculationId(id);
        announceStatsUpdate();
      }
    });
  }, [item, result, scan]);

  const showFeedback = calculationId !== null && result !== null;

  const sendFeedback = (accurate: boolean) => {
    if (calculationId === null || feedbackSent !== null) return;
    setFeedbackSent(accurate);
    void submitFeedback(calculationId, accurate).then(() => announceStatsUpdate());
  };

  const copyForDiscord = () => {
    if (!result || tracks.length === 0) return;
    const text = buildDiscordText({
      rarity: RARITY_INFO[result.row.rarity].label,
      title: displayName,
      tracks,
    });
    // Called synchronously off the click — an awaited wrapper drops the user
    // gesture and uBlock Origin flags the clipboard write as clickjacking.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      // Insecure-context fallback (http on the Tailnet IP).
      const area = document.createElement("textarea");
      area.value = text;
      area.style.opacity = "0";
      area.style.position = "fixed";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, 2000);
  };

  const placeholderFor = (range: NumberRange | null): string => {
    if (!item) return "Select an item first";
    if (!range) return "";
    return `${fmt(range.min)} - ${fmt(range.max)}`;
  };

  const numberField = (opts: {
    id: string;
    label: React.ReactNode;
    onChange: (value: string) => void;
    range: NumberRange | null;
    tint?: string | undefined;
    value: string;
    error?: string | undefined;
  }) => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground" htmlFor={opts.id}>
        {opts.label}
      </label>
      <Input
        autoComplete="off"
        className={cn(opts.error && "border-destructive")}
        disabled={!item}
        id={opts.id}
        inputMode="numeric"
        onChange={(e) => opts.onChange(e.target.value)}
        placeholder={placeholderFor(opts.range)}
        style={opts.tint ? { color: opts.tint } : undefined}
        value={opts.value}
      />
      {opts.error && <p className="text-sm text-destructive">{opts.error}</p>}
    </div>
  );

  const rarityOptions: ComboboxOption[] =
    resolution.status === "ambiguous"
      ? resolution.survivors.map((row) => ({
          color: RARITY_INFO[row.rarity].color,
          description: `${potentialPercentile(resolution.pot, row).toFixed(1)}%`,
          label: RARITY_INFO[row.rarity].label,
          value: row.rarity,
        }))
      : [];

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <ImagePasteZone key={pasteGeneration} onScan={handleScan} />

        {/* Numbers came through but the name didn't — the user can finish the
         job by picking. */}
        {scan && extract && !extract.item && itemId === "" && (
          <p className="text-xs text-muted-foreground">Couldn't recognize item, pick it below.</p>
        )}

        <form
          autoComplete="off"
          className="space-y-4 rounded-lg border border-border bg-surface-lowest p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="item-picker">
              Item
            </label>
            <Combobox
              onChange={handleItemChange}
              options={itemOptions}
              placeholder="Search items…"
              searchPlaceholder="Search by item or dungeon…"
              value={itemId}
              {...(previewRarity === null ? {} : { valueColor: RARITY_INFO[previewRarity].color })}
            />
            {item && item.rows.length === 0 && (
              <p className="text-sm text-destructive">
                No min/max data recorded for this item yet — the source sheet has no numbers for it.
              </p>
            )}
          </div>

          {resolution.status === "ambiguous" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="rarity-picker">
                Rarity
              </label>
              <Combobox
                onChange={(next) => setManualRarity(next as Rarity)}
                options={rarityOptions}
                placeholder="Fits multiple rarities — pick one…"
                value={manualRarity ?? ""}
              />
              <p className="text-xs text-muted-foreground">Same numbers, different curve — each rarity shows its percentile.</p>
            </div>
          )}

          {numberField({
            id: "ups-total",
            label: "Total upgrades",
            onChange: setUpsTotalStr,
            range: fields.ranges.total,
            value: upsTotalStr,
            error: fields.errors.total,
          })}

          {numberField({
            id: "ups-done",
            label: "Upgrades",
            onChange: setUpsDoneStr,
            range: fields.total !== null ? { min: 0, max: fields.total } : null,
            value: upsDoneStr,
            error: fields.errors.done,
          })}

          {item?.class === "hybrid" ? (
            <>
              {numberField({
                error: fields.errors.stat,
                id: "stat-input",
                label: "Physical Damage",
                onChange: setStatStr,
                range: fields.ranges.stat,
                tint: TRACK_CHROME.physical,
                value: statStr,
              })}
              {numberField({
                error: fields.errors.spell,
                id: "spell-input",
                label: "Spell Power",
                onChange: setSpellStr,
                range: fields.ranges.stat,
                tint: TRACK_CHROME.spell,
                value: spellStr,
              })}
            </>
          ) : (
            numberField({
              id: "stat-input",
              label: statLabel,
              onChange: setStatStr,
              range: fields.ranges.stat,
              tint:
                item === undefined
                  ? undefined
                  : TRACK_CHROME[
                      item.class === "guardian" || pickedStat?.kind === "health"
                        ? "health"
                        : pickedStat?.kind === "spell" || item.class === "mage"
                          ? "spell"
                          : "physical"
                    ],
              value: statStr,
              error:
                fields.errors.stat ??
                (resolution.status === "no-fit" && item
                  ? item.glitched
                    ? "These numbers don't match this item's glitched rows. Double-check them."
                    : `These numbers don't fit any rarity of the ${item.name} — double-check them (OCR can misread a digit).`
                  : undefined),
            })
          )}

          {item && fields.ranges.health && (
            numberField({
              id: "health-input",
              label: "Health",
              onChange: setHealthStr,
              range: fields.ranges.health,
              tint: TRACK_CHROME.health,
              value: healthStr,
              error: fields.errors.health,
            })
          )}

          {result && (
            <ResultPanel
              copied={copied}
              onCopy={copyForDiscord}
              rarityColor={RARITY_INFO[result.row.rarity].color}
              title={displayName}
              tracks={tracks}
            />
          )}

          {showFeedback && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {feedbackSent === null && (
                <>
                  <span className="text-xs text-muted-foreground">Was this accurate?</span>
                  <button
                    className="text-xs font-medium text-green-400 underline hover:text-green-300"
                    onClick={() => sendFeedback(true)}
                    type="button"
                  >
                    Yes
                  </button>
                  <button
                    className="text-xs font-medium text-red-400 underline hover:text-red-300"
                    onClick={() => sendFeedback(false)}
                    type="button"
                  >
                    No
                  </button>
                </>
              )}
              {feedbackSent !== null && (
                <span className="text-xs text-muted-foreground">Thanks</span>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
