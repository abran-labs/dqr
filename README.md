# DQR-Calc

A free potential ("pot") calculator for [Dungeon Quest Reborn](https://www.roblox.com/) items.

Paste a screenshot of an item's tooltip and instantly find out how good the roll is — its full potential, how it ranks against everything that item could have rolled, and whether it's a God Pot or a dud.

## What it does

- **Screenshot in, answer out.** Client-side OCR reads the item name, stats, and upgrade count off a tooltip screenshot.
- **Computes potential** — the stat the item will have once every upgrade is spent.
- **Rates the roll** on a five-tier scale: Reverse God Pot, Low, Average, Good, God Pot.
- **Handles armor** with separate tracks for damage/spell power and health, and treats health as the primary track on Guardian gear.

No account, no database, nothing stored. Everything runs in the browser.

## Status

Early.

## Docs

| Doc | Contents |
|---|---|
| `docs/Info/Pot-System.md` | Pot formula, stat tracks, tier definitions |
| `docs/Info/Item-Data.md` | Item dataset schema, dungeon codes, data quirks |
| `docs/Info/OCR-Input.md` | Tooltip layout, OCR fields, sample screenshots |

## Tech

Astro 7 (static) · React 19 islands · TypeScript · Tailwind CSS v3 + TweakCN · Bun · Tesseract.js
