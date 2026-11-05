# Heading Reorder: details

The README covers what you need to start. This is the rest, as it was written before the README was cut down.

## What travels, and with whom

A **heading** takes its subheadings along, and swaps with the heading at the same level, however many deeper ones sit in between.

A **bullet** takes everything indented under it, sub-bullets and wrapped text alike, and swaps with the bullet at the same indent.

Neither one leaves its parent. Blank lines stay in the gap rather than travelling along, a line of text at column zero separates two lists, and a numbered list keeps its numbers.

Collapsed arrives collapsed, and the cursor keeps its line and column.

## Keyboard

One rule for headings and bullets: `Alt+arrow` moves the block with everything under it, `Shift+Alt+arrow` moves the line alone. Both take another key in the hotkey settings.

- `Alt+arrow` on a heading moves its section, and does nothing when there is no heading at the same level that way.
- On a bullet with no sibling that way, and on any other line, it hands over to Obsidian's own "Move line up/down". Since Obsidian 1.15 that one also takes a bullet out of its parent; before 1.15 it moves the line.
- A key you saved for "Move line up/down" wins over the plugin's default, so take `Alt+arrow` off it.

`Alt+arrow` is free out of the box: the window manager has nothing on it, Obsidian ships "Move line up/down" without a key, and Obsidian drops it from CodeMirror's default keymap. `Ctrl+Alt+arrow` looks free and is not, since GNOME takes it for switching workspace.

## Settings

Whether the arrows stay visible or wait for the pointer. They wait by default.

If a theme overlaps them with its own fold indicator, raise `--heading-reorder-offset` in `styles.css`.


## Tests

`node test/test.js`. Obsidian is stubbed, so no vault is needed.
