# Heading Reorder

Put the pointer on a heading and two small arrows appear in the margin, left of the text. Click the one pointing down and the section swaps places with the heading below it. Click up and it swaps with the one above.

A section is the heading and everything under it, subheadings included, so a `## Bread` with a `### Sourdough` inside travels whole.

## What counts as the heading next door

The one at the same level, with only deeper headings in between. A `##` swaps with the next `##`, however many `###` sit between them, and never with the `#` it lives under. A heading that is the first or the last of its parent shows the arrow it cannot use greyed out, so the column does not shift under the pointer as you move down the note.

The blank lines stay where they are instead of travelling with the section that trailed them. They belong to the gap between two sections and to the end of the file, so a file that ended without a blank line still does after a swap.

## Keyboard

`Shift+Alt+up` and `Shift+Alt+down` do the same move from the heading the cursor is on. They answer only there, and only when there is a sibling that way, so anywhere else the key goes on doing what it did. The commands are `Swap this section with the one above` and `Swap this section with the one below`, and take another key in the hotkey settings.

That key was picked rather than guessed. `Ctrl+Alt+arrow` looks free inside Obsidian and is not: on GNOME it switches workspace, so the app never receives it. `Alt+arrow` moves a line. `Shift+Alt+arrow` is clear on all three counts: nothing in the window manager, nothing in Obsidian's commands, and Obsidian drops it from CodeMirror's default keymap, where it would otherwise duplicate a line.

## Folds

A collapsed section arrives collapsed. Folds are held at positions, and the swap pulls the text out from under them, so the fold that was on the heading is read before the rewrite and put back on the line where that heading landed. Folds elsewhere in the note are not touched.

## Settings

Whether the arrows stay visible or wait for the pointer. They wait by default.

If a theme draws Obsidian's own fold indicator further into the margin than usual and the two overlap, raise `--heading-reorder-offset` in `styles.css`.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/heading-reorder/`, or point [BRAT](https://github.com/TfTHacker/obsidian42-brat) at this repo.

## Tests

`node test/test.js` covers which heading is the neighbour, how far a section reaches, what the file looks like after a swap, and where a folded heading has to be folded again. Obsidian is stubbed, so no vault is needed.
