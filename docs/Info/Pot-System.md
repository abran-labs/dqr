# Pot System

"Pot" is short for **potential**: what an item's primary stat will be once every upgrade on it has been spent. Two copies of the same item at the same difficulty roll different bases and different upgrade counts, so their pot differs. High pot = stronger item = more desirable.

## Formula

```
potential = currentBase + upgradesRemaining * 10
```

Where:

```
upgradesRemaining = upgradesTotal - upgradesDone
```

Each upgrade adds a flat **10** to the stat being upgraded. So an item with 0 upgrades spent has `potential = base + upgradesTotal * 10`, and a fully-upgraded item has `potential = currentStat` — the number on the tooltip *is* the pot.

Applies to Winter Outpost and later dungeons. See `docs/Info/Item-Data.md` for the legacy-dungeon exceptions.

## Which stat is "the" stat

Every item has one track that matters for pot. Upgrades are always poured into that track.

| Class (CSV `Class`) | Primary track | Also shown |
|---|---|---|
| `War`, `War Legend`, `War Ultimate` | Physical damage | — |
| `Mage`, `Mage Legend`, `Mage Ultimate` | Spell power | — |
| `DPS Armor` | Physical damage or spell power (matches the armor's own type) | Health (secondary) |
| `Guardian` | **Health** | Physical / spell (secondary) |
| `Legendary` | Physical damage | — |

Armor therefore has **two tracks**. For `DPS Armor` the app reports both: the damage/spell track (which the player upgrades) and the health track (which they usually leave alone but still care about). For `Guardian` armor the health track is the pot; the damage numbers are informational only.

## Percentile

How good a roll is, relative to what that exact item at that exact difficulty can produce:

```
percentile = (potential - minPotential) / (maxPotential - minPotential) * 100
```

Clamped to `0..100`. Reported to the user as "your item is N% optimal". Armor gets two percentiles, one per track.

`minPotential` / `maxPotential` come from the item's difficulty row (`docs/Info/Item-Data.md`).

## Tiers

The percentile is bucketed into five color-coded tiers so the verdict is readable at a glance.

| Tier | Meaning | Band | Color |
|---|---|---|---|
| **Reverse God Pot** | The worst possible roll. Rare, and rare is fun — so it gets its own badge instead of being lumped in with Low. | `p ≤ 1` | **violet** |
| **Low Pot** | Bad roll. | `1 < p ≤ 30` | red |
| **Average Pot** | Middle of the distribution. | `30 < p < 70` | yellow |
| **Good Pot** | Above average. | `70 ≤ p < 99` | green |
| **God Pot** | The best possible roll. | `p ≥ 99` | **gold** |

Decisions behind those numbers:

- **Violet for Reverse God.** The traffic-light set (red/yellow/green) is fully used by Low/Average/Good, and gold belongs to God. Violet reads as "special-rare" while staying unmistakably distinct from both gold and the red of a merely-bad Low roll.
- **1%/99% edges instead of exact equality.** Late-game pot ranges span millions of points; an exact `potential == maxPotential` hit is effectively a measure-zero event. The 1% bands keep the "you got THE roll" feeling reachable. Slightly generous by design.
- **30/70 split for the middle.** Rolls are roughly uniform across `[min, max]`, so equal-width Average band keeps "average" honest.

These are defaults, not physics. Thresholds and colors live in one config object next to the tier logic so they can be retuned without touching calculation code.
