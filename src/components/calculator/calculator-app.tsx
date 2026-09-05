import * as React from "react";

import { AutofillVote } from "@/components/calculator/autofill-vote";
import { ImagePasteZone } from "@/components/calculator/image-paste-zone";
import { ResultPanel } from "@/components/calculator/result-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUNGEONS, ITEMS, RARITY_INFO, type DqrItem, type ItemClass, type ItemRarityRow, type Rarity } from "@/lib/dqr-items";
import { buildDiscordText } from "@/lib/discord-copy";
import { displayItemName } from "@/lib/item-display";
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
import { type TooltipScan, scanTooltip, RaidBossError } from "@/lib/ocr";
import { readFieldPaste, type PasteField } from "@/lib/ocr-field";
import { extractTooltip, type ExtractedTooltip } from "@/lib/ocr-extract";
import { pickTooltipStat, statFieldLabel } from "@/lib/ocr-stat";
import { CALCULATOR_RESET_EVENT } from "@/lib/calculator-reset";
import { announceStatsUpdate, logCalculation } from "@/lib/stats-client";
import {
  autofillFailureMessage,
  autofillFromExtract,
  missingAutofillFields,
  type AutofillField,
} from "@/lib/autofill-feedback";

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

const fmt = (value: number): string => String(value);

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

  const [autofilled, setAutofilled] = React.useState<readonly AutofillField[]>([]);
  const [scanGen, setScanGen] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const [pasteGeneration, setPasteGeneration] = React.useState(0);
  const [fieldNote, setFieldNote] = React.useState<{
    id: string;
    message: string;
    tone: "info" | "error";
  } | null>(null);
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggedFromScan = React.useRef(false);

  const item = React.useMemo(() => ITEMS.find((i) => i.id === itemId), [itemId]);
  const pickedStat = React.useMemo(
    () => (extract === null ? null : pickTooltipStat(extract, item ?? null)),
    [extract, item],
  );
  const statLabel = statFieldLabel(item ?? null, pickedStat?.kind ?? null);
  const filledFields = new Set(autofilled);
  const missingFields = missingAutofillFields(extract !== null, autofilled);
  const itemAutofillError = autofillFailureMessage("item", itemId, missingFields);
  const statAutofillField: AutofillField | undefined =
    item === undefined || item.class === "hybrid"
      ? undefined
      : item.class === "guardian"
        ? "health"
        : item.class === "mage"
          ? "spell"
          : pickedStat?.kind === "spell"
            ? "spell"
            : "physical";

  const handleScan = React.useCallback((next: TooltipScan): boolean => {
    const ex = extractTooltip(next);
    const filled =
      ex.item !== null ||
      [ex.physical, ex.spell, ex.health, ex.upsDone, ex.upsTotal].some((v) => v !== null);
    // Wrong image: don't log (counter stays put), don't wipe a previous fill.
    if (!filled) return false;

    setScan(next);
    setExtract(ex);
    setScanGen((gen) => gen + 1);
    const fill = autofillFromExtract(ex);
    setAutofilled(fill.fields);
    setItemId(fill.itemId);
    setManualRarity(next.rarity);
    setStatStr(fill.statStr);
    setSpellStr(fill.spellStr);
    setUpsDoneStr(fill.upsDoneStr);
    setUpsTotalStr(fill.upsTotalStr);
    setHealthStr(fill.healthStr);
    loggedFromScan.current = true;
    setCalculationId(null);
    void logCalculation(next).then((id) => {
      if (id !== null) {
        setCalculationId(id);
        announceStatsUpdate();
      }
    });
    return true;
  }, []);

  // Paste an image straight into one field: read just that field's value
  // (docs/Info/OCR-Input.md labels, or the bare number in a zoomed crop)
  // and drop it in — range checks stay with the form's live validation.
  const pasteIntoField = React.useCallback(
    async (field: PasteField, id: string, blob: Blob) => {
      if (noteTimerRef.current !== null) {
        clearTimeout(noteTimerRef.current);
        noteTimerRef.current = null;
      }
      setFieldNote({ id, message: "Scanning image…", tone: "info" });
      const fail = (message: string) => {
        setFieldNote({ id, message, tone: "error" });
        noteTimerRef.current = setTimeout(() => {
          noteTimerRef.current = null;
          setFieldNote(null);
        }, 5000);
      };
      try {
        const scan = await scanTooltip(blob);
        const read = readFieldPaste(field, scan, item ?? null);
        if (read.value === null) {
          fail("Couldn't read a number from that image — paste the value manually.");
          return;
        }
        if (read.done !== null) setUpsDoneStr(String(read.done));
        if (read.total !== null) setUpsTotalStr(String(read.total));
        const value = String(read.value);
        switch (field) {
          case "upsDone":
            setUpsDoneStr(value);
            break;
          case "upsTotal":
            setUpsTotalStr(value);
            break;
          case "stat":
            setStatStr(value);
            break;
          case "spell":
            setSpellStr(value);
            break;
          case "health":
            setHealthStr(value);
            break;
        }
        setFieldNote(null);
      } catch (err) {
        console.error("Field OCR failed:", err);
        fail(
          err instanceof RaidBossError
            ? err.message
            : "Couldn't read that image — paste the value manually.",
        );
      }
    },
    [item],
  );

  const handleItemChange = (nextId: string) => {
    if (extract !== null && itemId === "" && !autofilled.includes("item")) {
      const selectedItem = ITEMS.find((candidate) => candidate.id === nextId);
      if (selectedItem !== undefined) {
        const fill = autofillFromExtract({ ...extract, item: selectedItem });
        setAutofilled(fill.fields.filter((field) => field !== "item"));
        setStatStr(fill.statStr);
        setSpellStr(fill.spellStr);
        setHealthStr(fill.healthStr);
      }
    }
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
    // Done-agnostic bounds: a correct stat with a misread `done` falls outside
    // the narrow window but inside this one. Only blame the stat when it fits
    // nowhere; otherwise leave it clean so resolution falls through to the
    // generic no-fit message instead of flagging the wrong field.
    const wideStat = statRange(rows);
    const errors: { total?: string; done?: string; stat?: string; spell?: string; health?: string } = {};
    if (item && total !== null && ranges.total && (total < ranges.total.min || total > ranges.total.max)) {
      errors.total = `Total upgrades must be between ${fmt(ranges.total.min)} - ${fmt(ranges.total.max)}`;
    }
    if (done !== null && total !== null && done > total) {
      errors.done = "Upgrades can't exceed total upgrades.";
    }
    if (item && stat !== null && ranges.stat && (stat < ranges.stat.min || stat > ranges.stat.max)) {
      if (!wideStat || stat < wideStat.min || stat > wideStat.max) {
        const label = item.class === "hybrid" ? "Physical Damage" : statLabel;
        errors.stat = `${label} must be between ${fmt(ranges.stat.min)} - ${fmt(ranges.stat.max)}`;
      }
    }
    if (item && spell !== null && ranges.stat && (spell < ranges.stat.min || spell > ranges.stat.max)) {
      if (!wideStat || spell < wideStat.min || spell > wideStat.max) {
        errors.spell = `Spell Power must be between ${fmt(ranges.stat.min)} - ${fmt(ranges.stat.max)}`;
      }
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
  // Title always comes from the selected dataset item — OCR titles are
  // often wrong. Armor appends a closed-set piece suffix (item-display).
  const displayOffense = pickedStat?.kind === "spell" || item?.class === "mage" ? "spell" : "physical";
  const displayName = displayItemName(item, displayOffense, extract?.title ?? null);
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
    if (noteTimerRef.current !== null) {
      clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    setFieldNote(null);
    loggedItemId.current = null;
    loggedFromScan.current = false;
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
    setAutofilled([]);
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
    if (loggedFromScan.current) return;
    if (!item) {
      loggedItemId.current = null;
      return;
    }
    if (!result || loggedItemId.current === item.id) return;
    loggedItemId.current = item.id;
    const payload = scan ?? { imageDataUrl: null, nameText: "", processedText: "", rarity: null, rawText: "" };
    void logCalculation(payload).then((id) => {
      if (id !== null) {
        setCalculationId(id);
        announceStatsUpdate();
      }
    });
  }, [item, result, scan]);

  const voteFor = (field: AutofillField): React.ReactNode => {
    if (!filledFields.has(field)) return null;
    if (field !== "item" && itemId === "") return null;
    // Remount per scan so a previous "Thanks" never carries over to new fills.
    return <AutofillVote key={`${field}-${scanGen}`} calculationId={calculationId} field={field} />;
  };

  const isDirty =
    itemId !== "" ||
    scan !== null ||
    extract !== null ||
    manualRarity !== null ||
    statStr !== "" ||
    spellStr !== "" ||
    upsDoneStr !== "" ||
    upsTotalStr !== "" ||
    healthStr !== "";

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
    autofillField?: AutofillField | undefined;
    id: string;
    label: React.ReactNode;
    onChange: (value: string) => void;
    pasteField: PasteField;
    range: NumberRange | null;
    tint?: string | undefined;
    value: string;
    error?: string | undefined;
    vote: React.ReactNode;
  }) => {
    const error =
      opts.error ??
      (item === undefined || opts.autofillField === undefined
        ? undefined
        : autofillFailureMessage(opts.autofillField, opts.value, missingFields));
    const errorId = `${opts.id}-error`;
    const note = fieldNote?.id === opts.id ? fieldNote : null;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor={opts.id}>
          {opts.label}
        </label>
        <Input
          autoComplete="off"
          aria-describedby={error ? errorId : note ? `${opts.id}-note` : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(error && "border-destructive")}
          disabled={!item}
          id={opts.id}
          inputMode="numeric"
          onChange={(e) => {
            // Digits only — a stray letter must not silently blank the
            // parsed value out of the calculation. When filtering changes
            // nothing, the controlled input keeps the typed junk unless
            // the DOM is reset here.
            const next = e.target.value.replace(/\D+/g, "");
            if (e.target.value !== next) e.target.value = next;
            opts.onChange(next);
          }}
          onPaste={(e) => {
            const image = Array.from(e.clipboardData?.items ?? []).find((entry) =>
              entry.type.startsWith("image/"),
            );
            if (image === undefined) return;
            // Field paste wins over the whole-form paste zone.
            e.preventDefault();
            e.stopPropagation();
            const blob = image.getAsFile();
            if (blob !== null) void pasteIntoField(opts.pasteField, opts.id, blob);
          }}
          placeholder={placeholderFor(opts.range)}
          style={opts.tint ? { color: opts.tint } : undefined}
          value={opts.value}
        />
        {error && (
          <p className="text-sm text-destructive" id={errorId} role="alert">
            {error}
          </p>
        )}
        {note && (
          <p
            className={cn("text-sm", note.tone === "error" ? "text-destructive" : "text-muted-foreground")}
            id={`${opts.id}-note`}
            role="status"
          >
            {note.message}
          </p>
        )}
        {opts.vote}
      </div>
    );
  };

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

        <form
          autoComplete="off"
          className="space-y-4 rounded-lg border border-border bg-surface-lowest p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="item-picker">
                Item
              </label>
              {isDirty && (
                <Button
                  className="h-auto px-1 py-0 hover:bg-transparent"
                  onClick={resetCalculator}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Clear
                </Button>
              )}
            </div>
            <Combobox
              error={itemAutofillError !== undefined}
              errorMessage={itemAutofillError}
              id="item-picker"
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
            {voteFor("item")}
          </div>

          {resolution.status === "ambiguous" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="rarity-picker">
                Rarity
              </label>
              <Combobox
                id="rarity-picker"
                onChange={(next) => setManualRarity(next as Rarity)}
                options={rarityOptions}
                placeholder="Fits multiple rarities — pick one…"
                value={manualRarity ?? ""}
              />
              <p className="text-xs text-muted-foreground">Same numbers, different curve — each rarity shows its percentile.</p>
            </div>
          )}

          {numberField({
            autofillField: "totalUpgrades",
            id: "ups-total",
            label: "Total upgrades",
            onChange: setUpsTotalStr,
            pasteField: "upsTotal",
            range: fields.ranges.total,
            value: upsTotalStr,
            error: fields.errors.total,
            vote: voteFor("totalUpgrades"),
          })}

          {numberField({
            autofillField: "upgrades",
            id: "ups-done",
            label: "Upgrades",
            onChange: setUpsDoneStr,
            pasteField: "upsDone",
            range: fields.total !== null ? { min: 0, max: fields.total } : null,
            value: upsDoneStr,
            error: fields.errors.done,
            vote: voteFor("upgrades"),
          })}

          {item?.class === "hybrid" ? (
            <>
              {numberField({
                autofillField: "physical",
                error: fields.errors.stat,
                id: "stat-input",
                label: "Physical Damage",
                onChange: setStatStr,
                pasteField: "stat",
                range: fields.ranges.stat,
                tint: TRACK_CHROME.physical,
                value: statStr,
                vote: voteFor("physical"),
              })}
              {numberField({
                autofillField: "spell",
                error: fields.errors.spell,
                id: "spell-input",
                label: "Spell Power",
                onChange: setSpellStr,
                pasteField: "spell",
                range: fields.ranges.stat,
                tint: TRACK_CHROME.spell,
                value: spellStr,
                vote: voteFor("spell"),
              })}
            </>
          ) : (
            numberField({
              autofillField: statAutofillField,
              id: "stat-input",
              label: statLabel,
              onChange: setStatStr,
              pasteField: "stat",
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
              vote: filledFields.has("physical")
                ? voteFor("physical")
                : filledFields.has("spell")
                  ? voteFor("spell")
                  : fields.ranges.health
                    ? null
                    : voteFor("health"),
            })
          )}

          {item && fields.ranges.health && (
            numberField({
              autofillField: "health",
              id: "health-input",
              label: "Health",
              onChange: setHealthStr,
              pasteField: "health",
              range: fields.ranges.health,
              tint: TRACK_CHROME.health,
              value: healthStr,
              error: fields.errors.health,
              vote: voteFor("health"),
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

        </form>
      </CardContent>
    </Card>
  );
}
