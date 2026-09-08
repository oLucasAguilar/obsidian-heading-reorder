# Heading Reorder

Put the pointer on a heading and two small arrows appear in the margin, left of the text. The arrows are for headings; a bullet moves by keyboard. Click the one pointing down and the section swaps places with the heading below it. Click up and it swaps with the one above.

A section is the heading and everything under it, subheadings included, so a `## Bread` with a `### Sourdough` inside travels whole.

## What counts as the heading next door

The one at the same level, with only deeper headings in between. A `##` swaps with the next `##`, however many `###` sit between them, and never with the `#` it lives under. A heading that is the first or the last of its parent shows the arrow it cannot use greyed out, so the column does not shift under the pointer as you move down the note.

The blank lines stay where they are instead of travelling with the section that trailed them. They belong to the gap between two sections and to the end of the file, so a file that ended without a blank line still does after a swap.

## Bullets

`Shift+Alt+up` and `Shift+Alt+down` do the same move on a list item. The bullet travels with everything indented under it, sub-bullets and wrapped text alike, and swaps with the bullet next door, which is the one it runs into at the same indent. Obsidian's own `Alt+up` moves the line and leaves the children behind; this moves the item.

Indent is to a list what the level is to a heading. A child swaps with its own siblings and never leaves the bullet it lives under, and a bullet at the left margin never picks up one that is indented.

Two bullets with a line of text at column zero between them are two lists, not one, so nothing swaps across it. A blank line between them is still one list, and the blank line stays in the gap.

A numbered list keeps its numbers: swapping the first with the second leaves a 1 above a 2, with the other text under them.

The cursor keeps the line it was on and the column it was at, so a bullet moved in the middle of writing it comes back under the cursor.

## Keyboard

The same two keys answer from the heading the cursor is on and from the list item the cursor is in, the innermost one where they are nested. They answer only there, and only when there is a sibling that way, so anywhere else the key goes on doing what it did. The commands are `Swap this section or list item with the one above` and `Swap this section or list item with the one below`, and take another key in the hotkey settings.

That key was picked rather than guessed. `Ctrl+Alt+arrow` looks free inside Obsidian and is not: on GNOME it switches workspace, so the app never receives it. `Alt+arrow` moves a line. `Shift+Alt+arrow` is clear on all three counts: nothing in the window manager, nothing in Obsidian's commands, and Obsidian drops it from CodeMirror's default keymap, where it would otherwise duplicate a line.

## Folds

A collapsed section arrives collapsed, and so does a collapsed bullet. Folds are held at positions, and the swap pulls the text out from under them, so the fold that was on the line is read before the rewrite and put back where that line landed. Folds elsewhere in the note are not touched.

## Settings

Whether the arrows stay visible or wait for the pointer. They wait by default.

If a theme draws Obsidian's own fold indicator further into the margin than usual and the two overlap, raise `--heading-reorder-offset` in `styles.css`.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/heading-reorder/`, or point [BRAT](https://github.com/TfTHacker/obsidian42-brat) at this repo.

## Tests

`node test/test.js` covers which heading or bullet is the neighbour, how far a section and an item reach, what the file looks like after a swap, where the caret and a fold land, and the numbering of an ordered list. Obsidian is stubbed, so no vault is needed.
