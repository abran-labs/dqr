# Pot System

Pot = **potential**: primary stat after every upgrade is spent. Same item + rarity, different bases/upgrade counts → different pot.

## Formula

```
potential = currentBase + upgradesRemaining * 10
upgradesRemaining = upgradesTotal - upgradesDone
```

Each upgrade adds a flat **10**. 0 spent → `base + upgradesTotal * 10`. Fully upgraded → tooltip number **is** the pot.

Winter Outpost onward. Legacy exceptions: `docs/Info/Item-Data.md`.

## Primary track

Upgrades go into one track, except hybrid legendaries (both physical and spell).

| Class (CSV `Class`) | Primary | Also shown |
|---|---|---|
| `War`, `War Legend`, `War Ultimate` | Physical damage | — |
| `Mage`, `Mage Legend`, `Mage Ultimate` | Spell power | — |
| `DPS Armor` | Damage or spell (armor's type) | Health (secondary) |
| `Guardian` | **Health** | Physical / spell (secondary) |
| `Legendary` (Desert Fury, Crystalised Greatsword) | Physical **and** spell | Hybrid weapons — two pots, same upgrade remaining × 10, one stored band |

Armor has **two tracks**. `DPS Armor`: report both (player upgrades damage/spell; health still matters). `Guardian`: health is pot; damage is informational.

## Percentile

```
percentile = (potential - minPotential) / (maxPotential - minPotential) * 100
```

Clamped `0..100`. Shown as "N% optimal". Armor: one percentile per track. Min/max from the rarity row (`docs/Info/Item-Data.md`).

## Tiers

| Tier | Meaning | Band | Color |
|---|---|---|---|
| **Reverse God Pot** | Worst possible roll. Own badge, not lumped into Low. | `p ≤ 1` | **violet** |
| **Low Pot** | Bad roll. | `1 < p ≤ 30` | red |
| **Average Pot** | Middle of the distribution. | `30 < p < 70` | yellow |
| **Good Pot** | Above average. | `70 ≤ p < 99` | green |
| **God Pot** | Best possible roll. | `p ≥ 99` | **gold** |

- Violet: traffic-light already used; gold is God; violet = rare-special, not Low-red.
- 1%/99% not exact min/max: late-game ranges span millions; exact cap is measure-zero. Slightly generous on purpose.
- 30/70: rolls roughly uniform on `[min, max]`, so equal-width Average.

Defaults, not physics. Thresholds + colors live in one config next to tier logic.
