import { cn } from "@/lib/utils";

export const XP_EVENTS = [
  { boost: 0, label: "No event", value: "none" },
  { boost: 1, label: "2× EXP", value: "2x" },
  { boost: 0.5, label: "1.5× EXP", value: "1.5x" },
] as const;
export type XpEventId = (typeof XP_EVENTS)[number]["value"];
export type XpBoostKey = "vip" | "solo" | "hardcore" | "xpBoost";

const BOOSTS: readonly { readonly key: XpBoostKey; readonly label: string }[] = [
  { key: "vip", label: "VIP +20%" },
  { key: "solo", label: "Solo +10%" },
  { key: "hardcore", label: "Hardcore +25%" },
  { key: "xpBoost", label: "XP Boost +100%" },
];

export function LevelBoosts({ boosts, eventId, fromLevel, multiplier, onBoost, onEvent }: {
  readonly boosts: Record<XpBoostKey, boolean>;
  readonly eventId: XpEventId;
  readonly fromLevel: number;
  readonly multiplier: number;
  readonly onBoost: (key: XpBoostKey) => void;
  readonly onEvent: (event: XpEventId) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Active boosts <span className="font-normal text-muted-foreground">· {multiplier.toFixed(2)}×</span></p>
      <div className="flex flex-wrap gap-2">
        {BOOSTS.map((boost) => {
          const automatic = boost.key === "xpBoost" && fromLevel < 180;
          return (
            <button
              aria-pressed={automatic || boosts[boost.key]}
              className={cn("rounded-md border px-3 py-2 text-sm", automatic || boosts[boost.key] ? "border-primary bg-primary/10" : "border-border text-muted-foreground", automatic && "cursor-default")}
              disabled={automatic}
              key={boost.key}
              onClick={() => onBoost(boost.key)}
              type="button"
            >{automatic ? "XP Boost +100% (Auto)" : boost.label}</button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {XP_EVENTS.map((event) => (
          <button
            aria-pressed={eventId === event.value}
            className={cn("rounded-md border px-3 py-2 text-sm", eventId === event.value ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}
            key={event.value}
            onClick={() => onEvent(event.value)}
            type="button"
          >{event.label}</button>
        ))}
      </div>
    </div>
  );
}
