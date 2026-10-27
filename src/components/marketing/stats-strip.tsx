import { Calculator, Gauge, Swords } from "lucide-react";
import * as React from "react";

import { formatDamage } from "@/lib/damage-math";
import { fetchStats, STATS_UPDATED_EVENT, type StatsSummary } from "@/lib/stats-client";
import { THEORETICAL_MAX_DAMAGE } from "@/lib/theoretical-damage";

type StatsStripProps = {
  readonly className?: string;
};

export function StatsStrip({ className }: StatsStripProps) {
  const [stats, setStats] = React.useState<StatsSummary | null>(null);
  const [pathname, setPathname] = React.useState("/");

  const load = React.useCallback(() => {
    void fetchStats().then(setStats);
  }, []);

  React.useEffect(() => {
    load();
    window.addEventListener(STATS_UPDATED_EVENT, load);
    return () => window.removeEventListener(STATS_UPDATED_EVENT, load);
  }, [load]);
  React.useEffect(() => {
    const sync = () => setPathname(window.location.pathname.replace(/\/$/, "") || "/");
    sync();
    document.addEventListener("astro:page-load", sync);
    document.addEventListener("astro:after-swap", sync);
    return () => {
      document.removeEventListener("astro:page-load", sync);
      document.removeEventListener("astro:after-swap", sync);
    };
  }, []);

  const content = pathname === "/loadout" ? (
    <span className="flex items-center gap-1.5">
      <Swords className="h-4 w-4" aria-hidden />
      {formatDamage(THEORETICAL_MAX_DAMAGE, { decimals: 2, approximate: false })} theoretical max damage
    </span>
  ) : pathname === "/level" && stats !== null ? (
    <span className="flex items-center gap-1.5">
      <Calculator className="h-4 w-4" aria-hidden />
      {stats.levelsCalculated.toLocaleString("en-US")} {stats.levelsCalculated === 1 ? "level" : "levels"} calculated
    </span>
  ) : pathname === "/" && stats !== null ? (
    <>
      <span className="flex items-center gap-1.5">
        <Gauge className="h-4 w-4" aria-hidden />
        {stats.accuracy ?? 0}% accuracy
        <span className="text-muted-foreground/70">({stats.feedbackTotal === 1 ? "1 vote" : `${stats.feedbackTotal} votes`})</span>
      </span>
      <span className="text-border" aria-hidden>·</span>
      <span className="flex items-center gap-1.5">
        <Calculator className="h-4 w-4" aria-hidden />
        {stats.itemsCalculated.toLocaleString("en-US")} items calculated
      </span>
    </>
  ) : null;

  return (
    <div
      className={`flex min-h-5 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm leading-5 text-muted-foreground ${className ?? ""}`}
      aria-busy={pathname !== "/loadout" && stats === null}
    >
      {content}
    </div>
  );
}
