import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { TRACK_CHROME, TRACK_LABEL, type Track } from "@/lib/item-tracks";
import { classifyTier, TIER_INFO } from "@/lib/pot-utils";

const fmt = (value: number): string => value.toLocaleString("en-US");

function ResultRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TrackBlock({ track }: { track: Track }) {
  const tier = TIER_INFO[classifyTier(track.percentile)];
  const valueColor = track.valueLabel === "Health" ? TRACK_CHROME.health : tier.color;
  return (
    <div className="space-y-1 border-l-2 pl-3" style={{ borderColor: TRACK_CHROME[track.chrome] }}>
      <div
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: TRACK_CHROME[track.chrome] }}
      >
        {TRACK_LABEL[track.kind]}
      </div>
      <ResultRow
        label={track.valueLabel}
        value={<span style={{ color: valueColor }}>{fmt(track.value)}</span>}
      />
      <ResultRow
        label="Percentile"
        value={<span style={{ color: tier.color }}>{track.percentile.toFixed(1)}%</span>}
      />
      <ResultRow
        label="Tier"
        value={<span style={{ color: tier.color }}>{tier.label}</span>}
      />
    </div>
  );
}

export interface ResultPanelProps {
  readonly title: string;
  readonly rarityColor: string;
  readonly tracks: readonly Track[];
  readonly copied: boolean;
  readonly onCopy: () => void;
}

export function ResultPanel({ title, rarityColor, tracks, copied, onCopy }: ResultPanelProps) {
  return (
    <div className="space-y-4 rounded-md border border-border bg-surface-low p-4">
      <div className="flex items-center justify-between gap-2 border-b border-foreground/20 pb-1">
        <div
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: rarityColor }}
        >
          {title}
        </div>
        <Button
          aria-label="Copy for Discord"
          className="h-8 w-8"
          onClick={onCopy}
          size="icon"
          title="Copy for Discord"
          type="button"
          variant="ghost"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      <div className="space-y-4">
        {tracks.map((track) => (
          <TrackBlock key={track.kind} track={track} />
        ))}
      </div>
    </div>
  );
}
