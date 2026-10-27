import * as React from "react";

import { ResultFrame } from "@/components/calculator/result-frame";
import { publishDamageAverage } from "@/lib/damage-comparison";
import type { DamageResult } from "@/lib/damage-math";
import { formatDamage } from "@/lib/damage-math";
import type { InnerBuff } from "@/lib/damage-types";

const INNER_LABELS = {
  enhanced: { combined: "EIR/EIF", physical: "EIR", spell: "EIF" },
  inner: { combined: "IR/IF", physical: "IR", spell: "IF" },
} as const;

/** Damage spread colours share the pot palette: neutral mean, red floor, green ceiling. */
const LOW_COLOR = "#F87171";
const HIGH_COLOR = "#4ADE80";

export function innerLabel(value: InnerBuff, offense: "physical" | "spell" | null): string {
  if (value === "none") return "None";
  return offense === null ? INNER_LABELS[value].combined : INNER_LABELS[value][offense];
}

function ResultRow({ label, value, color, large }: {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
  readonly large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={large === true ? "text-right text-2xl font-semibold tabular-nums text-foreground" : "text-right font-semibold tabular-nums text-foreground"}
        style={color === undefined ? undefined : { color }}
      >
        {value}
      </span>
    </div>
  );
}

export function DamageResultPanel({ result, title, accentColor }: {
  readonly result: DamageResult;
  readonly title: string;
  readonly accentColor: string;
}) {
  React.useEffect(() => {
    publishDamageAverage(result.average);
    return () => publishDamageAverage(null);
  }, [result.average]);
  return (
    <ResultFrame accentColor={accentColor} title={title}>
      <div className="space-y-1 border-l-2 pl-3" style={{ borderColor: accentColor }}>
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
          DPS
        </div>
        <ResultRow label="Average damage" value={formatDamage(result.average, { decimals: 2, approximate: false })} large />
        <ResultRow color={LOW_COLOR} label="Lowest damage" value={formatDamage(result.low, { decimals: 2, approximate: false })} />
        <ResultRow color={HIGH_COLOR} label="Highest damage" value={formatDamage(result.high, { decimals: 2, approximate: false })} />
      </div>
    </ResultFrame>
  );
}
