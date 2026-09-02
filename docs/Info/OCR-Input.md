# OCR Input

Input = screenshot of a DQR item tooltip. Local samples: `assets/` (`1.png`–`4.png`).

## Tooltip layout

Bordered card, top to bottom:

```
        <Item Name>              white, centered, top
Physical Damage: / Physical power:   label salmon-red, value salmon-red
Spell Power:                          label + value light purple
Health:                               label + value bright green   (armor only)
REQ Lvl. <n>                          white
Upgrades: <done>/<total>              label cyan, value light purple
Sell: <n>                             label + value yellow/gold
```

**Text colors are fixed.** Card background + border encode rarity. `src/lib/rarity-color.ts` votes on dark chrome pixels (ignores bright text). Samples: `assets/Rarities/`.

Item name is white. White-only name plate (top band) is OCRed separately — gray/threshold pass drops the title on purple Epic cards (`assets/4.png` Crystalline Shard Staff).

| Rarity | Chrome |
|---|---|
| Common | desaturated gray |
| Uncommon | green (~116°) |
| Rare | blue (~240°) |
| Epic | purple (~292°) |
| Legendary | orange (~38°) |
| Ultimate | red (~0°) |

Label wording varies: `Physical Damage:` vs `Physical power:`, `Spell Power:` vs `Spell power:`. Match case-insensitively; tolerate wrap onto two lines (`Physical` / `power:`). The value often sits on the first line (`Physical 739072` / `power:`). DPS armor shows both tracks — pick Warrior→physical / Mage→spell from the title, else the in-range number.

## Fields

| Field | Required | Notes |
|---|---|---|
| Item name | preferred | Fuzzy-matched against the item list. If the title is missing, a unique stat fingerprint (upgrades + primary, plus health/rarity when they disambiguate) may identify the item; overlapping fingerprints stay unmatched. |
| Physical damage | yes for War/Legendary | Current value, post-upgrades-so-far |
| Spell power | yes for Mage | Current value |
| Health | armor only | Green line |
| Upgrades done / total | yes | `done` → `upgradesRemaining = total - done` |
| `REQ Lvl.` | optional | Dungeon-based; cannot disambiguate rarity |
| Sell | no | Ignore |

## Sample screenshots

| File | Item | Class | Upgrades | Notes |
|---|---|---|---|---|
| `assets/1.png` | Midgardian Mage Helmet | Mage armor | `94812/94812` | Fully upgraded → displayed spell power *is* the pot |
| `assets/2.png` | Midgardian Mage Armor | Mage armor | `99012/99012` | Fully upgraded |
| `assets/3.png` | Ice Spellblade | Mage weapon | `330961/330961` | Fully upgraded |
| `assets/4.png` | Crystalline Shard Staff | Mage weapon | `0/282463` | **Un-upgraded** → displayed spell power is the base |

0-upgrades and max-upgrades are the range ends; both must work. Partial upgrades are the general case.

Armor samples name a **piece** (`Midgardian Mage Helmet`) while the dataset has the **set** (`Midgardian`). Strip class/piece qualifiers. Pieces share set min/max — string match, not a data gap. See armor-set quirk in `docs/Info/Item-Data.md`.

## Pipeline

`src/lib/ocr.ts` + `src/components/image-paste-zone.tsx`:

- Shared Tesseract.js worker singleton, browser-side, no server route.
- Same preprocess in browser and bun tests: `src/lib/ocr-pixels.ts` (Mitchell cubic color upscale, native threshold then nearest, white name plate). Not ImageMagick, not canvas `imageSmoothingQuality: "high"` (that bilinear path reads `739072` as `7139072`).
- Two passes (color + threshold), merged text.
- `similarity` / `bestMatch` fuzzy name lookup. Unique-stat fallback in `src/lib/item-guess.ts` when no title scores.
- Upgrade pair repair in `src/lib/ocr-upgrades.ts`: dropped `/` concatenates equal halves (`2854028540`); `/` read as `1` (`28540128540`); doubled digit on done when it exceeds total.
- Paste-anywhere, drag-drop, file picker, preview.

DQR numbers are 8–10 digits; one OCR digit error is catastrophic. Cross-check every extracted number against the matched item's plausible range before accepting.

## Accuracy

Wrong pot is worse than no answer. Prefer flagging a field for manual confirmation over guessing.
