import { TRACK_LABEL, type Track } from "./item-tracks";
import { classifyTier, TIER_INFO } from "./pot-utils";

const SEP = "> ---------------------------------------->";

export interface DiscordPaste {
  readonly title: string;
  readonly rarity: string;
  readonly tracks: readonly Track[];
}

const fmt = (value: number): string => value.toLocaleString("en-US");

function trackRows(track: Track, named: boolean): readonly string[] {
  const pct = track.percentile.toFixed(1);
  const tier = TIER_INFO[classifyTier(track.percentile)].label;
  const header = named ? [`> **${TRACK_LABEL[track.kind]}**`] : [];
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
    ...paste.tracks.flatMap((track) => trackRows(track, named)),
    SEP,
  ].join("\n");
}
