import { Check, Copy } from "lucide-react";
import * as React from "react";

import { ImagePasteZone } from "@/components/calculator/image-paste-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUNGEONS, ITEMS, RARITY_INFO, type DqrItem, type ItemClass, type ItemRarityRow, type Rarity } from "@/lib/dqr-items";
import {
  calculatePotential,
  classifyTier,
  healthRange,
  potentialPercentile,
  resolveRarityRows,
  rowPotRange,
  statRange,
  TIER_INFO,
  upsRange,
  type NumberRange,
} from "@/lib/pot-utils";
import { type TooltipScan } from "@/lib/ocr";
import { extractTooltip, type ExtractedTooltip } from "@/lib/ocr-extract";
import { announceStatsUpdate, logCalculation, submitFeedback } from "@/lib/stats-client";

/*
  Calculator island — AbyssFishLog-style form (docs/ai/design-system.md):
  fields stacked one under another, ranges as placeholders, live validation,
  auto-calculation (no button). Resolution flow: docs/Info/Item-Data.md.
*/

const STAT_LABEL: Record<ItemClass, string> = {
  dps: "Physical / Spell Power",
  guardian: "Health",
  mage: "Spell Power",
  war: "Physical Damage",
};

const CLASS_LABEL: Record<ItemClass, string> = {
  dps: "DPS armor",
  guardian: "Guardian armor",
  mage: "Mage",
  war: "Warrior",
};

const DUNGEON_NAME = new Map(DUNGEONS.map((d) => [d.code, d.name] as const));

const fmt = (value: number): string => value.toLocaleString("en-US");

const parseNumber = (value: string): number | null => {
  const cleaned = value.replace(/[,_\s]/g, "");
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
};

const itemOptions: ComboboxOption[] = ITEMS.map((item) => ({
  color: RARITY_INFO[item.maxRarity].color,
  description: `${RARITY_INFO[item.maxRarity].label} · ${CLASS_LABEL[item.class]}${item.glitched ? " · glitched" : ""}${item.rows.length === 0 ? " · no data yet" : ""}`,
  group: DUNGEON_NAME.get(item.dungeon) ?? item.dungeon,
  keywords: item.dungeon,
  label: item.name,
  value: item.id,
}));

interface CalcResult {
  readonly item: DqrItem;
  readonly row: ItemRarityRow;
  readonly pot: number;
  readonly percentile: number;
  readonly math: { readonly stat: number; readonly done: number; readonly total: number };
}

const DISCORD_SEP = "> ---------------------------------------->";

function buildDiscordText(result: CalcResult, tierLabel: string): string {
  const pct = result.percentile.toFixed(1);
  const lines = [
    `**${result.item.name}**`,
    `**\`${fmt(result.pot)} POT\`** | **\`${RARITY_INFO[result.row.rarity].label}\`** | **\`${pct}% ${tierLabel}\`**`,
    DISCORD_SEP,
    `> :trophy: Potential: \`${fmt(result.pot)}\``,
    `> :chart_with_upwards_trend: Tier: \`${tierLabel}\` (${pct}%)`,
    `> :arrow_up: Upgrades: \`${fmt(result.math.done)} / ${fmt(result.math.total)}\``,
    `> :gem: ${STAT_LABEL[result.item.class]}: \`${fmt(result.math.stat)}\``,
    DISCORD_SEP,
  ];
  return lines.join("\n");
}

function ResultRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function CalculatorApp() {
  const [scan, setScan] = React.useState<TooltipScan | null>(null);
  const [extract, setExtract] = React.useState<ExtractedTooltip | null>(null);
  const [autoFilled, setAutoFilled] = React.useState<boolean | null>(null);
  const [scanCalculationId, setScanCalculationId] = React.useState<number | null>(null);

  const [itemId, setItemId] = React.useState<string>("");
  const [manualRarity, setManualRarity] = React.useState<Rarity | null>(null);
  const [statStr, setStatStr] = React.useState("");
  const [upsDoneStr, setUpsDoneStr] = React.useState("");
  const [upsTotalStr, setUpsTotalStr] = React.useState("");
  const [healthStr, setHealthStr] = React.useState("");

  const [manualCalculationId, setManualCalculationId] = React.useState<number | null>(null);
  const [askFeedback, setAskFeedback] = React.useState(false);
  const [feedbackSent, setFeedbackSent] = React.useState<boolean | null>(null);
  const [copied, setCopied] = React.useState(false);

  const item = React.useMemo(() => ITEMS.find((i) => i.id === itemId), [itemId]);

  const handleScan = (next: TooltipScan) => {
    setScan(next);
    setScanCalculationId(null);
    setFeedbackSent(null);
    // Autofill — a fresh scan replaces the whole form state. Implausible
    // reads stay and surface as the fields' existing range errors.
    const ex = extractTooltip(next);
    setExtract(ex);
    // Success copy must match reality: the zone only claims "Auto-filled"
    // when the scan actually produced an item or any number.
    const filled =
      ex.item !== null ||
      [ex.physical, ex.spell, ex.health, ex.upsDone, ex.upsTotal].some((v) => v !== null);
    setAutoFilled(filled);
    // Class-ordered stat candidates, first one inside the item's live stat
    // range wins (a DPS armor's physical line can misread tiny — "203" —
    // while the spell line holds the real value).
    const statCandidates: Array<number | null> = ex.item
      ? ex.item.class === "guardian"
        ? [ex.health]
        : ex.item.class === "mage"
          ? [ex.spell]
          : ex.item.class === "war"
            ? [ex.physical]
            : [ex.physical, ex.spell]
      : [ex.spell, ex.physical, ex.health];
    const statRangeBounds = ex.item ? statRange(ex.item.rows) : null;
    const stat =
      statCandidates.find(
        (cand): cand is number =>
          cand !== null &&
          (statRangeBounds === null || (cand >= statRangeBounds.min && cand <= statRangeBounds.max)),
      ) ?? null;
    setItemId(ex.item?.id ?? "");
    setManualRarity(null);
    setStatStr(stat !== null ? String(stat) : "");
    setUpsDoneStr(ex.upsDone !== null ? String(ex.upsDone) : "");
    setUpsTotalStr(ex.upsTotal !== null ? String(ex.upsTotal) : "");
    setHealthStr(ex.item?.class === "dps" && ex.health !== null ? String(ex.health) : "");
    void logCalculation(next).then((id) => {
      if (id !== null) {
        setScanCalculationId(id);
        announceStatsUpdate();
      }
    });
  };

  const handleItemChange = (nextId: string) => {
    setItemId(nextId);
    setManualRarity(null);
  };

  // Live ranges + per-field validation (an out-of-range read is a misread —
  // the same check OCR auto-fill will use).
  const fields = React.useMemo(() => {
    const total = parseNumber(upsTotalStr);
    const done = parseNumber(upsDoneStr);
    const stat = parseNumber(statStr);
    const health = parseNumber(healthStr);
    const rows = item?.rows ?? [];
    const ranges: { total: NumberRange | null; stat: NumberRange | null; health: NumberRange | null } = {
      total: upsRange(rows),
      stat: statRange(rows, done ?? undefined),
      health: healthRange(rows),
    };
    const errors: { total?: string; done?: string; stat?: string; health?: string } = {};
    if (item && total !== null && ranges.total && (total < ranges.total.min || total > ranges.total.max)) {
      errors.total = `Total upgrades must be between ${fmt(ranges.total.min)} - ${fmt(ranges.total.max)}`;
    }
    if (done !== null && total !== null && done > total) {
      errors.done = "Upgrades can't exceed total upgrades.";
    }
    if (item && stat !== null && ranges.stat && (stat < ranges.stat.min || stat > ranges.stat.max)) {
      errors.stat = `${STAT_LABEL[item.class]} must be between ${fmt(ranges.stat.min)} - ${fmt(ranges.stat.max)}`;
    }
    if (health !== null && ranges.health && (health < ranges.health.min || health > ranges.health.max)) {
      errors.health = `Health must be between ${fmt(ranges.health.min)} - ${fmt(ranges.health.max)}`;
    }
    return { done, errors, health, ranges, stat, total };
  }, [item, statStr, upsDoneStr, upsTotalStr, healthStr]);

  // Auto-resolution — runs on every keystroke, no calculate button.
  const resolution = React.useMemo(() => {
    if (!item) return { status: "empty" as const };
    if (item.rows.length === 0) return { status: "no-data" as const };
    const { done, errors, health, stat, total } = fields;
    if (stat === null || done === null || total === null) return { status: "empty" as const };
    if (errors.total || errors.done || errors.stat || errors.health) return { status: "invalid" as const };

    const pot = calculatePotential(stat, done, total);
    const survivors = resolveRarityRows(item, { health: health ?? undefined, pot, upgradesTotal: total });
    if (survivors.length === 0) return { status: "no-fit" as const };
    if (manualRarity) {
      const chosen = survivors.find((row) => row.rarity === manualRarity);
      if (chosen) return { status: "ok" as const, row: chosen, math: { done, stat, total }, pot };
    }
    if (survivors.length === 1) {
      return { status: "ok" as const, row: survivors[0] as ItemRarityRow, math: { done, stat, total }, pot };
    }
    return { status: "ambiguous" as const, survivors, math: { done, stat, total }, pot };
  }, [item, fields, manualRarity]);

  const result: CalcResult | null =
    item && resolution.status === "ok"
      ? {
          item,
          math: resolution.math,
          percentile: potentialPercentile(resolution.pot, resolution.row),
          pot: resolution.pot,
          row: resolution.row,
        }
      : null;
  const tier = result ? classifyTier(result.percentile) : null;
  const tierInfo = tier ? TIER_INFO[tier] : null;

  // One logged calculation per settled result (debounced; scans log eagerly
  // with their screenshot above). Occasional accuracy prompt: ~1 in 3.
  const fingerprint =
    item && result ? `${item.id}|${result.row.rarity}|${fields.stat}|${fields.done}|${fields.total}|${fields.health ?? ""}` : null;
  const loggedFingerprint = React.useRef<string | null>(null);
  React.useEffect(() => {
    setFeedbackSent(null);
    setAskFeedback(Math.random() < 0.34);
    setManualCalculationId(null);
    if (fingerprint === null || fingerprint === loggedFingerprint.current) return;
    const timer = setTimeout(() => {
      loggedFingerprint.current = fingerprint;
      void logCalculation({ imageDataUrl: null, processedText: "", rawText: "" }).then((id) => {
        if (id !== null) {
          setManualCalculationId(id);
          announceStatsUpdate();
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [fingerprint]);

  const activeCalculationId = scan ? scanCalculationId : manualCalculationId;
  const showFeedback = activeCalculationId !== null && askFeedback;

  const sendFeedback = (accurate: boolean) => {
    if (activeCalculationId === null || feedbackSent !== null) return;
    setFeedbackSent(accurate);
    void submitFeedback(activeCalculationId, accurate).then(() => announceStatsUpdate());
  };

  const copyForDiscord = () => {
    if (!result || !tierInfo) return;
    const text = buildDiscordText(result, tierInfo.label);
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
    setTimeout(() => setCopied(false), 2000);
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
        <ImagePasteZone autofilled={autoFilled} onScan={handleScan} />

        {/* Numbers came through but the name didn't — the user can finish the
         job by picking. A scan with nothing at all is the wrong image (the
         paste zone already says so). */}
        {scan && extract && !extract.item && itemId === "" && autoFilled === true && (
          <p className="text-xs text-muted-foreground">Couldn't recognize item, pick it below.</p>
        )}

        <div className="space-y-4 rounded-lg border border-border bg-surface-lowest p-4">
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

          {numberField({
            id: "stat-input",
            label: item ? STAT_LABEL[item.class] : "Stat",
            onChange: setStatStr,
            range: fields.ranges.stat,
            tint: tierInfo?.color,
            value: statStr,
            error:
              fields.errors.stat ??
              (resolution.status === "no-fit" && item
                ? item.glitched
                  ? "These numbers don't match this item's glitched rows. Double-check them."
                  : `These numbers don't fit any rarity of the ${item.name} — double-check them (OCR can misread a digit).`
                : undefined),
          })}

          {item && fields.ranges.health && (
            numberField({
              id: "health-input",
              label: (
                <>
                  Health <span className="font-normal text-muted-foreground">(optional — sharpens rarity detection)</span>
                </>
              ),
              onChange: setHealthStr,
              range: fields.ranges.health,
              value: healthStr,
              error: fields.errors.health,
            })
          )}

          {result && tierInfo && (
            <div className="space-y-3 rounded-md border border-border bg-surface-low p-4">
              <div
                className="mb-1 border-b border-foreground/20 pb-1 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: RARITY_INFO[result.row.rarity].color }}
              >
                {result.item.name} · {RARITY_INFO[result.row.rarity].label}
              </div>
              <div className="space-y-1">
                <ResultRow
                  label="Potential"
                  value={
                    <span style={{ color: tierInfo.color }}>{fmt(result.pot)}</span>
                  }
                />
                <ResultRow label="Percentile" value={`${result.percentile.toFixed(1)}%`} />
                <ResultRow
                  label="Tier"
                  value={<span style={{ color: tierInfo.color }}>{tierInfo.label}</span>}
                />
                <ResultRow label={`Current ${STAT_LABEL[result.item.class]}`} value={fmt(result.math.stat)} />
                <ResultRow
                  label="Potential range"
                  value={`${fmt(rowPotRange(result.row).minPot)} – ${fmt(rowPotRange(result.row).maxPot)}`}
                />
              </div>
            </div>
          )}

          {(result || showFeedback) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {result && (
                <Button onClick={copyForDiscord} size="sm" variant="outline">
                  {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy for Discord"}
                </Button>
              )}
              {showFeedback && feedbackSent === null && (
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
                <span className="text-xs text-muted-foreground">Thanks — recorded.</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
