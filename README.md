# Heading Reorder

Moves a heading or a bullet with everything under it.

- Hover a heading and two arrows appear in the margin. They swap the section with the one above or below.
- `Shift+Alt+up` and `Shift+Alt+down` do the same from the heading the cursor is on, or the bullet it is in.

## What travels, and with whom

A **heading** takes its subheadings along, and swaps with the heading at the same level, however many deeper ones sit in between.

A **bullet** takes everything indented under it, sub-bullets and wrapped text alike, and swaps with the bullet at the same indent. Obsidian's own `Alt+up` moves the line and leaves the children behind.

Neither one leaves its parent. Blank lines stay in the gap rather than travelling along, a line of text at column zero separates two lists, and a numbered list keeps its numbers.

Collapsed arrives collapsed, and the cursor keeps its line and column.

## Keyboard

The commands are `Swap this section or list item with the one above` and `Swap this section or list item with the one below`, and take another key in the hotkey settings. They answer only on a heading or a bullet with a sibling that way; anywhere else the key does what it did before.

`Shift+Alt+arrow` was picked because it is free three ways over: the window manager has nothing on it, no Obsidian command claims it, and Obsidian drops it from CodeMirror's default keymap. `Ctrl+Alt+arrow` looks free and is not, since GNOME takes it for switching workspace.

## Settings

Whether the arrows stay visible or wait for the pointer. They wait by default.

If a theme overlaps them with its own fold indicator, raise `--heading-reorder-offset` in `styles.css`.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/heading-reorder/`, or point [BRAT](https://github.com/TfTHacker/obsidian42-brat) at this repo.

## Tests

`node test/test.js`. Obsidian is stubbed, so no vault is needed.
