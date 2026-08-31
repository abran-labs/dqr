import { Calculator, Gauge } from "lucide-react";
import * as React from "react";

import { fetchStats, STATS_UPDATED_EVENT, type StatsSummary } from "@/lib/stats-client";

type StatsStripProps = {
  readonly className?: string;
};

/*
  Live counters under the nav — AbyssFishLog's header-stat language
  (icon + count + dot separators). Renders nothing until loaded or if
  the stats API is unreachable (purely additive UI).
*/

export function StatsStrip({ className }: StatsStripProps) {
  const [stats, setStats] = React.useState<StatsSummary | null>(null);

  const load = React.useCallback(() => {
    void fetchStats().then(setStats);
  }, []);

  React.useEffect(() => {
    load();
    window.addEventListener(STATS_UPDATED_EVENT, load);
    return () => window.removeEventListener(STATS_UPDATED_EVENT, load);
  }, [load]);

  if (stats === null) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground ${
        className ?? ""
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Gauge className="h-4 w-4" aria-hidden />
        {stats.accuracy ?? 0}% accuracy
        <span className="text-muted-foreground/70">
          ({stats.feedbackTotal === 1 ? "1 vote" : `${stats.feedbackTotal} votes`})
        </span>
      </span>
      <span className="text-border" aria-hidden>
        ·
      </span>
      <span className="flex items-center gap-1.5">
        <Calculator className="h-4 w-4" aria-hidden />
        {stats.itemsCalculated.toLocaleString("en-US")} items calculated
      </span>
    </div>
  );
}
