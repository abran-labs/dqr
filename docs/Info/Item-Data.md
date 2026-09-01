# Item Data

Source file: `docs/DQR_Min_Max_List.csv` — 1358 data rows (plus ~494 blank padding rows) covering 362 distinct items across 14 dungeons. Gilded Skies (`GS`, 74 rows) is in the sheet but beyond DQR's current content (Northern Lands) — the generator skips it. Boss Raids (between Steampunk Sewers and Orbital Outpost in-game) has no sheet data yet; add rows + a generator entry when it does.

This is the raw dump. Phase 1 converts it into a typed config module (`src/lib/dqr-items.ts`), which then becomes the source of truth for the app. The CSV stays in `docs/` as the human-editable original.

## Columns

| Column | Use |
|---|---|
| `Initials` | Dungeon code (see table below) |
| `Item Name` | Item or armor-set name |
| `Rarity` | **Always empty.** Rarity comes from row position / `Class` suffix (below). |
| `Min Ups` / `Max Ups` | Upgrade-count range for this item at this rarity |
| `Min Base` / `Max Base` | Base-stat range before upgrades |
| `Class` | See the class table in `docs/Info/Pot-System.md` |
| `Health` | Armor only: nominal health. Empty for weapons and Guardian rows. |
| `Min Potential` / `Max Potential` | Primary-stat pot range |
| `Lowest Health` / `Highest Health` | Armor health roll range. `0,0` when not applicable. |
| `Unrounded Min/Max Upgrades`, `Average Ups`, `Average Base`, `Unrounded Min/Max Base` | Derived/intermediate. Not needed — the game only awards whole upgrades. Drop unless a use appears. |

## Dungeon codes

In release order. No "Legacy" markers — in DQR everything is legacy by default:

| Code | Dungeon |
|---|---|
| `DT` | Desert Temple |
| `WO` | Winter Outpost |
| `PI` | Pirate Island |
| `KC` | King's Castle |
| `UW` | The Underworld |
| `SP` | Samurai Palace |
| `TC` | The Canals |
| `GH` | Ghastly Harbor |
| `SS` | Steampunk Sewers |
| `OO` | Orbital Outpost |
| `VC` | Volcanic Chambers |
| `AT` | Aquatic Temple |
| `EF` | Enchanted Forest |
| `NL` | Northern Lands |

`GS` Gilded Skies rows exist in the CSV but are skipped (beyond DQR content). Yokai Peak and Abyssal Void exist in-game but are not in this dataset.

## Structure

Rows are grouped by `(Initials, Item Name)`. Each group is normally **4 rows = 4 rarities, ascending: Common, Uncommon, Rare, Epic**. 332 items have 4 rows, 30 have 1 (single-rarity items — see below; Eden's Reaper and Eden's Vengeance carry no stat cells, so they import with empty rows), 1 has 3 (`Stone Strongsword` — but its 4th row hides under the `Pi` typo, so it merges back to 4 on import).

Rarity mapping is verified against the wiki's weapon stat tables (`Bronze Dagger` wiki averages 6/2 · 7/3 · 8/4 · 9/5 = our four rows' midpoints exactly).

**Single-row items** are single-rarity items and the CSV says which in the `Class` column:

| `Class` value | Meaning |
|---|---|
| `War` / `Mage` | Warrior / Mage weapon (multi-rarity, 4 rows) |
| `War Legend` / `Mage Legend` | Legendary weapon (1 row) |
| `War Ultimate` / `Mage Ultimate` | Ultimate weapon (1 row) — Eden's Reaper, Eden's Vengeance, Hofund, Laevateinn |
| `Legendary` | Legendary, class unstated — treated as physical per `docs/Info/Pot-System.md` (2 rows: Desert Fury, Crystalised Greatsword) |
| `Guardian` | Health-track armor |
| `DPS Armor` | Damage/spell-track armor |

Example — `NL / Ice Spellblade` (Mage):

| Rarity | Min Ups | Max Ups | Min Base | Max Base | Min Pot | Max Pot |
|---|---|---|---|---|---|---|
| 1 | 304000 | 336000 | 36290000 | 40110000 | 39330000 | 43470000 |
| 2 | 310650 | 343350 | 37810000 | 41790000 | 40916500 | 45223500 |
| 3 | 317300 | 350700 | 39330000 | 43470000 | 42503000 | 46977000 |
| 4 | 323000 | 357000 | 40850000 | 45150000 | 44080000 | 48720000 |

Note `Min Pot = Min Base + Min Ups * 10` and `Max Pot = Max Base + Max Ups * 10` — the formula from `docs/Info/Pot-System.md`, verified across the row.

## Potentials are derivable — except where they are not

`Min/Max Potential` can be recomputed from `Min/Max Base` and `Min/Max Ups`, so it should be derived rather than stored. Verified across all 1925 rows:

| Dungeon | Rows matching `base + ups * 10` |
|---|---|
| `PI`–`NL` (Pirate Island onward) | **all** (except 4 rows, see below) |
| `WO` Winter Outpost | 132 / 197 |
| `DT` Desert Temple | 3 / 101 |

So:
- **Pirate Island and later: derive.** One exception — `PI / Godly` (DPS Armor), all 4 rows, does not fit.
- **Winter Outpost: mixed.** 17 of its ~78 item groups fail entirely (`Coldstone Sword`, `Frozen Greatsword`, `Holy Grail`, `Ice`, `Ice Enhanced Sword`, `Ice King's`, `Infernal Elemental Sword`, `Magma Infused Staff`, `Plate`, `Elite (Warlord/Mage) Plate`, `Forgotten`, `Reinforced Steel Sword`, `Sapphire Spell Dagger`, `Snowy Greatstaff`, `Steel Strongsword`, and partially `Bluefire Staff`, `Crimson Spell Blade`, `Diamond Encrusted Blade`).
- **Desert Temple: does not use the formula at all.** Consistent with "the +10-per-upgrade rule applies from Winter Outpost onward" — and even WO is only partly consistent.

Practical rule: **derive where the formula checks out, fall back to the CSV's stored potentials where it does not.** The converter script should verify each row and record which mode it used, so bad data surfaces instead of silently producing wrong pots.

## Data quirks

- **Blank separator rows** near the end of the file (all-empty). Skip them.
- **`Pi` vs `PI`** — one row uses lowercase-i initials. Normalize.
- **Glitched items.** A second `GH` block at the very end holds `(Glitched) Seafarer's Lost Blade` rows, appended after the blank rows. These are items from a period when the drop was bugged, producing values outside the normal range. Keep them as their own item entries and flag them in the UI: if a screenshot's numbers only fit the glitched rows, report "this is a glitched item" rather than forcing it onto the normal curve.
- **Trailing whitespace** in some names (e.g. `"Elite (Warlord/Mage) Plate  "`). Trim on import.
- **Slash / pipe names** — `Novice | Blue Wizard`, `Mercenary/Elemental`, `Angelic/Infernal` are single rows covering multiple visually distinct armor sets. Name matching must handle these as aliases, not literal item names.
- **Armor sets, not pieces — and that is fine.** Armor rows are named for the set (e.g. `Midgardian`), not the piece. A helmet and a chestplate roll different numbers but share the same min/max range, so one row group covers both. Verified: `assets/1.png` (helmet, pot 4,350,147) and `assets/2.png` (chest, pot 4,504,121) both land inside the same `Midgardian` row 3 (Rare), at 44.3% and 79.5% respectively. Name matching just has to strip the class/piece qualifiers (`Midgardian Mage Helmet` → `Midgardian`) and use `Class` to pick the DPS-Armor vs Guardian group.
- **Guardian rows are separate items.** `Midgardian` (DPS Armor) and `Midgardian Guardian` (Guardian) are distinct groups. For Guardian rows `Min/Max Base` and `Min/Max Potential` are the *health* track and `Health`/`Lowest Health`/`Highest Health` are empty/zero — the opposite of DPS Armor rows.

## Rarity selection

Given a screenshot (or manual entry), the app must pick **which of the item's 4 rarity rows** it is. This matters because the same pot is a great roll at one rarity and a terrible roll at the next — the ranges are shifted, not shared.

The rows are deliberately overlapping: `Ice Spellblade` row 1 (Common) spans upgrades `304000–336000` and row 2 (Uncommon) spans `310650–343350`. An item with `330961` total upgrades sits inside both. So the upgrade count alone is not enough to identify a row.

Filters, applied together:

1. **Total upgrades** inside `[Min Ups, Max Ups]`.
2. **Computed pot** inside `[Min Potential, Max Potential]`.
3. **Health** inside `[Lowest Health, Highest Health]` — armor only, and the strongest signal because the health bands barely overlap.

Measured against the samples:

| Sample | Candidate rows after filtering |
|---|---|
| `1.png` Midgardian helmet | **1** (row 3 / Rare, 44.3%) |
| `2.png` Midgardian chest | **1** (row 3 / Rare, 79.5%) |
| `3.png` Ice Spellblade | 3 (rows 2/3/4 → 90.8% / 51.9% / 16.1%) |
| `4.png` Crystalline Shard Staff | 2 (rows 3/4 → 42.7% / 10.9%) |

So **armor resolves uniquely** thanks to the health check, while **weapons often do not** — and the residual ambiguity is large (a weapon can read as anything from "God-tier" to "mediocre" depending on which row is assumed).

## Resolution flow (settled)

After OCR (or manual entry), resolve the rarity row like this:

1. Match the item name to a row group. Single-row items (the 33 legendaries/ultimates) skip the rest — no rarity question exists for them.
2. Filter the group's rows: keep rows where **total upgrades**, **computed pot**, and (armor) **health** all fit.
3. **Card color** (`docs/Info/OCR-Input.md`) picks among survivors when the screenshot chrome matches one of them. This is how weapons that sit in overlapping upgrade/pot bands (e.g. `assets/3.png` Ice Spellblade) autofill instead of asking.
4. **Exactly one row survives → autofill.** Calculate and show the result. The user is never asked. This is the armor case and most fully-upgraded items.
5. **More than one survives and color didn't pick → ask.** Show a rarity selector pre-filled with only the surviving candidates (2–3 of 4), each showing what's at stake ("Rare: 90.8% · Epic: 51.9%"). Asking is acceptable here; silently guessing from the numbers is not.
6. **Zero survive → hard error.** Wrong numbers (OCR misread), a glitched item (numbers only fit the glitched rows), or a legacy item outside the formula's reach. Surface it, never force-fit.

Note: `REQ Lvl.` cannot disambiguate rows — level requirement tracks the dungeon's difficulty, not the item's rarity. With rows confirmed as rarities, that tie-breaker idea is retired.
