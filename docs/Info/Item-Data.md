# Item Data

Source: `docs/Info/DQR_Min_Max_List.csv` — 1358 data rows (~494 blank padding), 362 items, 14 dungeons. Generator writes `src/lib/dqr-items.ts` (app source of truth). CSV stays the human-editable original.

Gilded Skies (`GS`, 74 rows) is in the sheet, beyond DQR content (Northern Lands) — generator skips it. Boss Raids (between Steampunk Sewers and Orbital Outpost) has no rows yet. Yokai Peak and Abyssal Void exist in-game, not in this dataset.

## Columns

| Column | Use |
|---|---|
| `Initials` | Dungeon code |
| `Item Name` | Item or armor-set name |
| `Rarity` | **Always empty.** Rarity = row position / `Class` suffix. |
| `Min Ups` / `Max Ups` | Upgrade-count range at this rarity |
| `Min Base` / `Max Base` | Base-stat range before upgrades |
| `Class` | See class table in `docs/Info/Pot-System.md` |
| `Health` | Armor only: nominal health. Empty for weapons and Guardian. |
| `Min Potential` / `Max Potential` | Primary-stat pot range |
| `Lowest Health` / `Highest Health` | Armor health roll. `0,0` if N/A. |
| `Unrounded Min/Max Upgrades`, `Average Ups`, `Average Base`, `Unrounded Min/Max Base` | Derived. Game awards whole upgrades. Drop unless a use appears. |

## Dungeon codes

Release order. In DQR everything is legacy by default.

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

## Structure

Grouped by `(Initials, Item Name)`. Normal group: **4 rows = Common, Uncommon, Rare, Epic** (ascending). 332 items have 4 rows, 30 have 1, 1 has 3 (`Stone Strongsword` — 4th row hides under the `Pi` typo; import merges to 4).

Rarity mapping checked against wiki weapon tables (`Bronze Dagger` averages 6/2 · 7/3 · 8/4 · 9/5 = four-row midpoints).

| `Class` | Meaning |
|---|---|
| `War` / `Mage` | Warrior / Mage weapon (4 rows) |
| `War Legend` / `Mage Legend` | Legendary weapon (1 row) |
| `War Ultimate` / `Mage Ultimate` | Ultimate weapon (1 row) — Eden's Reaper, Eden's Vengeance, Hofund, Laevateinn |
| `Legendary` | Hybrid war/mage legendary weapon → item class `hybrid` (Desert Fury, Crystalised Greatsword). Two offense tracks; see `docs/Info/Pot-System.md`. |
| `Guardian` | Health-track armor |
| `DPS Armor` | Damage/spell-track armor |

Example — `NL / Ice Spellblade` (Mage):

| Rarity | Min Ups | Max Ups | Min Base | Max Base | Min Pot | Max Pot |
|---|---|---|---|---|---|---|
| 1 | 304000 | 336000 | 36290000 | 40110000 | 39330000 | 43470000 |
| 2 | 310650 | 343350 | 37810000 | 41790000 | 40916500 | 45223500 |
| 3 | 317300 | 350700 | 39330000 | 43470000 | 42503000 | 46977000 |
| 4 | 323000 | 357000 | 40850000 | 45150000 | 44080000 | 48720000 |

`Min Pot = Min Base + Min Ups * 10`, `Max Pot = Max Base + Max Ups * 10` (`docs/Info/Pot-System.md`).

## When to derive pot

`Min/Max Potential` = `base + ups * 10` except where it isn't. Checked on all 1925 rows:

| Dungeon | Rows matching `base + ups * 10` |
|---|---|
| `PI`–`NL` | **all** except 4 (`PI / Godly` DPS Armor) |
| `WO` | 132 / 197 |
| `DT` | 3 / 101 |

- **Pirate Island onward: derive.** Exception: `PI / Godly`, all 4 rows.
- **Winter Outpost: mixed.** 17 groups fail (`Coldstone Sword`, `Frozen Greatsword`, `Holy Grail`, `Ice`, `Ice Enhanced Sword`, `Ice King's`, `Infernal Elemental Sword`, `Magma Infused Staff`, `Plate`, `Elite (Warlord/Mage) Plate`, `Forgotten`, `Reinforced Steel Sword`, `Sapphire Spell Dagger`, `Snowy Greatstaff`, `Steel Strongsword`; partial: `Bluefire Staff`, `Crimson Spell Blade`, `Diamond Encrusted Blade`).
- **Desert Temple: do not derive.** +10/upgrade starts at Winter Outpost, and even WO is only partly consistent.

**Derive where the formula checks out; else use stored CSV pots.** Converter should record which mode each row used.

## Quirks

- **Blank separator rows** (all-empty) near EOF. Skip.
- **`Pi` vs `PI`** — one lowercase-i row. Normalize.
- **Glitched items.** Second `GH` block after blanks: `(Glitched) Seafarer's Lost Blade`, values outside the normal range. Own entries. If a screenshot only fits glitched rows, say so — don't force onto the normal curve.
- **Trailing whitespace** in names (e.g. `"Elite (Warlord/Mage) Plate  "`). Trim.
- **Slash / pipe names** — `Novice | Blue Wizard`, `Mercenary/Elemental`, `Angelic/Infernal` = one row, several visual sets. Aliases, not literal names.
- **Armor sets, not pieces.** `Midgardian` covers helmet and chest (different rolls, same min/max). `assets/1.png` helmet pot 4,350,147 (44.3%) and `assets/2.png` chest pot 4,504,121 (79.5%) both land in `Midgardian` row 3 (Rare). Strip class/piece (`Midgardian Mage Helmet` → `Midgardian`); use `Class` for DPS vs Guardian.
- **Guardian rows are separate.** `Midgardian` (DPS Armor) ≠ `Midgardian Guardian`. Guardian: `Min/Max Base` and `Min/Max Potential` are the **health** track; `Health` / `Lowest Health` / `Highest Health` empty/zero — opposite of DPS Armor.

## Rarity selection

Must pick **which of 4 rarity rows**. Same pot can be great at one rarity and terrible at the next. Ranges overlap: `Ice Spellblade` Common ups `304000–336000`, Uncommon `310650–343350`. `330961` total ups sits in both.

Filters, together:

1. Total upgrades in `[Min Ups, Max Ups]`.
2. Computed pot in `[Min Potential, Max Potential]`.
3. Health in `[Lowest Health, Highest Health]` — armor only; strongest signal (health bands barely overlap).

Samples:

| Sample | Candidates after filter |
|---|---|
| `1.png` Midgardian helmet | **1** (row 3 / Rare, 44.3%) |
| `2.png` Midgardian chest | **1** (row 3 / Rare, 79.5%) |
| `3.png` Ice Spellblade | 3 (rows 2/3/4 → 90.8% / 51.9% / 16.1%) |
| `4.png` Crystalline Shard Staff | 2 (rows 3/4 → 42.7% / 10.9%) |

Armor usually unique (health). Weapons often not — residual ambiguity is large.

## Resolution flow

1. Match name to a row group. Single-row items (33 legendaries/ultimates) stop here.
2. Keep rows where **total upgrades**, **computed pot**, and (armor) **health** all fit.
3. **Card color** (`docs/Info/OCR-Input.md`) picks among survivors when chrome matches. Weapons in overlapping bands (e.g. `assets/3.png` Ice Spellblade) autofill this way.
4. **One survivor → autofill.** Never ask. Armor + most fully-upgraded items.
5. **Several survivors, color didn't pick → ask.** Selector with only survivors (2–3 of 4), each showing the stake ("Rare: 90.8% · Epic: 51.9%"). Do not silently guess.
6. **Zero → hard error.** OCR misread, glitched item, or legacy outside the formula. Never force-fit.

`REQ Lvl.` cannot disambiguate — it tracks dungeon difficulty, not rarity.
