# OCR Input

The app's input is a screenshot of a DQR item tooltip. Reference samples live in `assets/` (`1.png`–`4.png`).

## Tooltip layout

A bordered card, top to bottom:

```
        <Item Name>              white, centered, top
Physical Damage: / Physical power:   label salmon-red, value salmon-red
Spell Power:                          label + value light purple
Health:                               label + value bright green   (armor only)
REQ Lvl. <n>                          white
Upgrades: <done>/<total>              label cyan, value light purple
Sell: <n>                             label + value yellow/gold
```

**Text colors are fixed** regardless of item. Only the card background and border change — those encode rarity, not stats. This means color is a reliable channel for segmenting fields and can be used as a preprocessing step or a cross-check on OCR output.

Label wording varies: `Physical Damage:` vs `Physical power:`, `Spell Power:` vs `Spell power:`. Match case-insensitively and tolerate the line wrapping onto two lines (`Physical` / `power:` with the number to the right).

## Fields the app needs

| Field | Required | Notes |
|---|---|---|
| Item name | yes | Fuzzy-matched against the item list |
| Physical damage | yes for War/Legendary | Current value, post-upgrades-so-far |
| Spell power | yes for Mage | Current value |
| Health | armor only | Green line, present only on armor |
| Upgrades done / total | yes | `done` drives `upgradesRemaining = total - done` |
| `REQ Lvl.` | optional | Candidate tie-breaker for difficulty selection |
| Sell | no | Ignore |

## Sample screenshots

| File | Item | Class | Upgrades | Notes |
|---|---|---|---|---|
| `assets/1.png` | Midgardian Mage Helmet | Mage armor | `94812/94812` | Fully upgraded → displayed spell power *is* the pot |
| `assets/2.png` | Midgardian Mage Armor | Mage armor | `99012/99012` | Fully upgraded |
| `assets/3.png` | Ice Spellblade | Mage weapon | `330961/330961` | Fully upgraded |
| `assets/4.png` | Crystalline Shard Staff | Mage weapon | `0/282463` | **Un-upgraded** → displayed spell power is the base |

The 0-upgrades and max-upgrades cases are the two ends of the range; both must work. Partial upgrades are the general case.

## Notable mismatches in the samples

The armor samples name a **piece** (`Midgardian Mage Helmet`, `Midgardian Mage Armor`) while the dataset only has the **set** (`Midgardian`). Name matching has to strip the class/piece qualifiers to find the row. Pieces share the set's min/max ranges, so this is a pure string-matching problem, not a data gap. See the armor-set bullet in `docs/Info/Item-Data.md`.

## Reuse from AbyssFishLog

`src/lib/ocr.ts` and `src/components/image-paste-zone.tsx` carry over structurally:

- Shared Tesseract.js worker singleton, browser-side, no server route.
- `loadAndScale` canvas upscale before recognition.
- Two parallel passes (color + preprocessed grayscale) with merged text.
- `similarity` / `bestMatch` fuzzy string matching for the name lookup.
- Paste-anywhere listener, drag-drop, file picker, preview.

What gets replaced: every field extractor (they parse fish weight, stars, mutations), the Discord-text parsing path, and the sanity-correction logic. The number-recovery idea is still worth keeping — DQR numbers are long (8–10 digits) and a single OCR digit error is both likely and catastrophic. Cross-check every extracted number against the matched item's plausible range before accepting it.

## Accuracy requirement

The tool is only useful if OCR is right. The text is large, high-contrast, and fixed-color, so this should be achievable — but the failure mode (a confidently wrong pot) is worse than no answer. Prefer flagging a field for manual confirmation over guessing.
