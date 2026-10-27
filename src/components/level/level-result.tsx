import type { ReactNode } from "react";

import { ResultFrame } from "@/components/calculator/result-frame";
import { estimateMinutes, formatCompact, formatDuration, formatFull } from "@/lib/xp-math";

export interface LevelResultData {
  readonly color: string;
  readonly title: string;
  readonly remainingXp: number;
  readonly runs: number;
  readonly totalXp: number;
  readonly xpPerRun: number;
  readonly minutes: number | null;
}

function ResultRow({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function LevelResult({ result }: { readonly result: LevelResultData | null }) {
  if (result === null) return null;
  return (
    <ResultFrame title={result.title} accentColor={result.color}>
      <div className="space-y-1 border-l-2 pl-3" style={{ borderColor: result.color }}>
        <ResultRow label="Runs needed" value={<span style={{ color: result.color }}>{result.runs.toLocaleString("en-GB")}</span>} />
        <ResultRow label="Total XP" value={formatFull(result.totalXp)} />
        <ResultRow label="Remaining XP" value={formatFull(result.remainingXp)} />
        <ResultRow label="XP per run" value={formatCompact(result.xpPerRun)} />
        {result.minutes !== null && (
          <ResultRow label="Estimated time" value={formatDuration(estimateMinutes(result.runs, result.minutes))} />
        )}
      </div>
    </ResultFrame>
  );
}
