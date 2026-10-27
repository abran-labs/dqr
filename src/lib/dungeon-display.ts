import { DUNGEONS } from "./dqr-items";
import { xpDungeonIcon } from "./xp-dungeons";

export interface DungeonChrome {
  readonly color?: string;
  readonly icon?: string;
}

export function dungeonChrome(slug: string, name: string): DungeonChrome {
  const dungeon = DUNGEONS.find((entry) => entry.name === name);
  const icon = xpDungeonIcon(slug);
  return {
    ...(dungeon === undefined ? {} : { color: dungeon.color }),
    ...(icon === undefined ? {} : { icon }),
  };
}
