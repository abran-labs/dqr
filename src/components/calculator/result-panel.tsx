import type { ReactNode } from "react";

import { ResultFrame } from "@/components/calculator/result-frame";
import { TRACK_CHROME, trackHeading, type Track } from "@/lib/item-tracks";
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

function TrackBlock({ track, tracks }: { track: Track; tracks: readonly Track[] }) {
  const tier = TIER_INFO[classifyTier(track.percentile)];
  return (
    <div className="space-y-1 border-l-2 pl-3" style={{ borderColor: TRACK_CHROME[track.chrome] }}>
      <div
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: TRACK_CHROME[track.chrome] }}
      >
        {trackHeading(track, tracks)}
      </div>
      <ResultRow
        label={track.valueLabel}
        value={<span style={{ color: tier.color }}>{fmt(track.value)}</span>}
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
  readonly loadoutActions: ReactNode;
}

export function ResultPanel({ title, rarityColor, tracks, copied, onCopy, loadoutActions }: ResultPanelProps) {
  return (
    <ResultFrame title={title} accentColor={rarityColor} actions={loadoutActions} copied={copied} onCopy={onCopy}>
      {tracks.map((track) => (
        <TrackBlock key={`${track.kind}-${track.chrome}`} track={track} tracks={tracks} />
      ))}
    </ResultFrame>
  );
}
