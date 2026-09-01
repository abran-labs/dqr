import { trackHeading, type Track } from "./item-tracks";
import { classifyTier, TIER_INFO } from "./pot-utils";

const SEP = "> ---------------------------------------->";

export interface DiscordPaste {
  readonly title: string;
  readonly rarity: string;
  readonly tracks: readonly Track[];
}

const fmt = (value: number): string => value.toLocaleString("en-US");

function trackRows(track: Track, tracks: readonly Track[], named: boolean): readonly string[] {
  const pct = track.percentile.toFixed(1);
  const tier = TIER_INFO[classifyTier(track.percentile)].label;
  const header = named ? [`> **${trackHeading(track, tracks)}**`] : [];
  const value =
    track.valueLabel === "Potential"
      ? `> :trophy: Potential: \`${fmt(track.value)}\``
      : `> :green_heart: Health: \`${fmt(track.value)}\``;
  return [...header, value, `> :chart_with_upwards_trend: Tier: \`${tier}\` (${pct}%)`];
}

export function buildDiscordText(paste: DiscordPaste): string {
  const named = paste.tracks.length > 1;
  return [
    `**${paste.title}** · ${paste.rarity}`,
    SEP,
    ...paste.tracks.flatMap((track) => trackRows(track, paste.tracks, named)),
    SEP,
  ].join("\n");
}
