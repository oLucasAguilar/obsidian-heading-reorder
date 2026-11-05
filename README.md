# Heading Reorder

**Move a heading or a bullet with everything under it.**

- Hover a heading: two arrows in the margin swap it with the section above or below.
- `Alt+↑` and `Alt+↓` do the same for the heading or bullet the cursor is in.
- `Shift+Alt+↑` and `Shift+Alt+↓` move only the line, leaving what is under it in place.

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/reorder-dark.gif"><img alt="The arrow next to Bread moves the whole Bread section above Soup; then Alt+Up moves the Water bullet, with its child, above Flour" src="docs/reorder-light.gif"></picture>

If you bound `Alt+↑/↓` to Obsidian's "Move line up/down", remove that binding: yours wins over the plugin's.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/heading-reorder/`, or add this repo to [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## What moves

- A heading takes its subheadings and swaps with the next heading at the same level.
- A bullet takes everything indented under it and swaps with the next bullet at the same indent.
- Neither leaves its parent. Numbered lists keep their numbers, and what was collapsed stays collapsed.

Keyboard, settings and tests: [docs/usage.md](docs/usage.md).
