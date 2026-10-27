import { bossVisibleDifficulties, difficultyLabel, DUNGEONS, isBossRaidSlug, type XpDifficultyId } from "./xp-dungeons";
import {
  bossLevelError,
  boostMultiplier,
  boostedXpPerRun,
  estimateMinutes,
  remainingXp,
  runsNeeded,
  type BoostInput,
} from "./xp-math";

export interface XpRankingInput {
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly currentXp: number;
  readonly minutesPerRun: number | null;
  readonly boosts: BoostInput;
}

export interface XpCandidate {
  readonly id: string;
  readonly dungeonSlug: string;
  readonly dungeonName: string;
  readonly difficulty: XpDifficultyId;
  readonly difficultyLabel: string;
  readonly eligible: boolean;
  readonly reason: string | null;
  readonly multiplier: number;
  readonly xpPerRun: number;
  readonly runs: number;
  readonly totalMinutes: number | null;
}

export function rankXpCandidates(input: XpRankingInput): XpCandidate[] {
  const remainder = remainingXp(input.fromLevel, input.toLevel, input.currentXp);
  const candidates = DUNGEONS.flatMap((dungeon) =>
    bossVisibleDifficulties(dungeon.slug, dungeon.difficulties).map((difficulty): XpCandidate => {
      const boss = isBossRaidSlug(dungeon.slug);
      const reason = bossLevelError(dungeon.slug, input.fromLevel, input.toLevel);
      const multiplier = boostMultiplier({
        ...input.boosts,
        hardcore: boss ? false : input.boosts.hardcore,
        xpBoost: input.fromLevel < 180 || input.boosts.xpBoost,
      });
      const xpPerRun = boostedXpPerRun(difficulty.experience, multiplier);
      const runs = reason === null ? runsNeeded(remainder, xpPerRun) : 0;
      return {
        difficulty: difficulty.difficulty,
        difficultyLabel: difficultyLabel(difficulty.difficulty),
        dungeonName: dungeon.name,
        dungeonSlug: dungeon.slug,
        eligible: reason === null,
        id: `${dungeon.slug}:${difficulty.difficulty}`,
        multiplier,
        reason,
        runs,
        totalMinutes: input.minutesPerRun === null || reason !== null ? null : estimateMinutes(runs, input.minutesPerRun),
        xpPerRun,
      };
    }),
  );
  return candidates.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (left.runs !== right.runs) return left.runs - right.runs;
    if (left.xpPerRun !== right.xpPerRun) return right.xpPerRun - left.xpPerRun;
    return left.id.localeCompare(right.id);
  });
}

export function bestXpCandidate(candidates: readonly XpCandidate[]): XpCandidate | null {
  return candidates.find((candidate) => candidate.eligible) ?? null;
}
