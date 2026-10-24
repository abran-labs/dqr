import type { ItemRarityRow } from "@/lib/dqr-items";
import { classifyTier, potMarks, TIER_INFO } from "@/lib/pot-utils";

const fmt = (value: number): string => value.toLocaleString("en-US");

export interface PotPreviewProps {
  readonly row: ItemRarityRow;
}

export function PotPreview({ row }: PotPreviewProps) {
  const marks = potMarks(row);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface-low p-4">
      <div className="grid min-w-[32rem] grid-cols-6 gap-2 text-center">
        {marks.map((mark) => (
          <div className="text-xs text-muted-foreground" key={`p-${mark.percentile}`}>
            {mark.percentile}%
          </div>
        ))}
        {marks.map((mark) => (
          <div
            className="text-sm font-semibold"
            key={`v-${mark.percentile}`}
            style={{ color: TIER_INFO[classifyTier(mark.percentile)].color }}
          >
            {fmt(mark.pot)}
          </div>
        ))}
      </div>
    </div>
  );
}
