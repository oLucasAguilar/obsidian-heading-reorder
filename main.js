'use strict';

const obsidian = require('obsidian');
const { Decoration, ViewPlugin, WidgetType } = require('@codemirror/view');
const { Prec } = require('@codemirror/state');
const { foldable, foldedRanges, foldEffect, unfoldEffect } = require('@codemirror/language');
const { moveLineUp, moveLineDown, indentMore } = require('@codemirror/commands');

/* A fenced block may hold anything, hashes included, and none of it is a
 * heading. Fences are the only thing read here beyond the hashes themselves. */
function parseHeadings(text) {
  const lines = String(text).split('\n');
  const headings = [];
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const char = fence[1][0];
      if (fenceChar === null) fenceChar = char;
      else if (fenceChar === char) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    const match = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (match) headings.push({ index: headings.length, line: i, level: match[1].length, text: match[2] });
  }
  return { lines, headings };
}

// A heading owns everything under it until a heading of its own level or higher,
// so moving one moves what belongs to it.
function sectionEnd(headings, index, lineCount) {
  const level = headings[index].level;
  for (let i = index + 1; i < headings.length; i++) {
    if (headings[i].level <= level) return headings[i].line;
  }
  return lineCount;
}

/* The neighbour to swap with: the next heading of the same level, with only
 * deeper ones in between. A shallower heading first means the two are in
 * different parents, and swapping across that would move a section out of the
 * heading it lives under. */
function siblingIndex(headings, index, dir) {
  const level = headings[index].level;
  for (let i = index + dir; i >= 0 && i < headings.length; i += dir) {
    if (headings[i].level < level) return null;
    if (headings[i].level === level) return i;
  }
  return null;
}

/* A bullet holds what is indented under it, so the width of that indent is to a
 * list what the number of hashes is to a heading. A tab counts to the next stop
 * of four, the way an editor draws it. */
function indentWidth(line) {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+/;

/* The list items of a note, and which lines sit inside a fenced block. A dash
 * in a fence is not a bullet, so the fences are read once here and the answer
 * carried around instead of parsed again by everyone who walks the lines.
 *
 * The line that opens a fence is not marked: it is a line of the note like any
 * other, and its own indent decides whether it belongs to the item above it. */
function parseList(text) {
  const lines = String(text).split('\n');
  const items = [];
  const fenced = new Array(lines.length).fill(false);
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fence && (fenceChar === null || fence[1][0] === fenceChar)) {
      if (fenceChar === null) fenceChar = fence[1][0];
      else {
        fenceChar = null;
        fenced[i] = true;
      }
      continue;
    }
    if (fenceChar !== null) {
      fenced[i] = true;
      continue;
    }
    if (ITEM.test(line)) items.push({ index: items.length, line: i, indent: indentWidth(line) });
  }
  return { lines, items, fenced };
}

/* Where an item ends: the first line that steps back out to its own indent or
 * further left. Everything indented deeper belongs to it, blank lines on the
 * way included, which is the same rule the editor folds by. */
function itemEnd(lines, fenced, items, index) {
  const indent = items[index].indent;
  for (let i = items[index].line + 1; i < lines.length; i++) {
    if (fenced[i]) continue;
    if (lines[i].trim() === '') continue;
    if (indentWidth(lines[i]) <= indent) return i;
  }
  return lines.length;
}

/* The bullet next door is the one this item's block runs into, and only if it
 * stands at the same indent. Anything else means they are not siblings: a
 * shallower bullet belongs to the parent, and a paragraph or a heading in
 * between makes them two lists rather than one. */
function itemSibling(lines, fenced, items, index, dir) {
  const item = items[index];
  if (dir === 1) {
    const end = itemEnd(lines, fenced, items, index);
    for (const other of items) {
      if (other.line === end) return other.indent === item.indent ? other.index : null;
    }
    return null;
  }
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].indent > item.indent) continue;
    if (items[i].indent < item.indent) return null;
    return itemEnd(lines, fenced, items, i) === item.line ? i : null;
  }
  return null;
}

/* The item the cursor is in, the innermost one where they are nested, so a key
 * pressed on a child moves the child. A blank line answers nothing: it is
 * inside a block only because the block has not ended yet, and a key pressed
 * there is not aimed at the bullet above it. */
function itemAt(lines, fenced, items, lineNumber) {
  const target = lineNumber - 1;
  if (target < 0 || target >= lines.length) return -1;
  if (lines[target].trim() === '') return -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].line > target) continue;
    if (itemEnd(lines, fenced, items, i) > target) return items[i].index;
  }
  return -1;
}

function splitTrailingBlank(block) {
  let end = block.length;
  while (end > 0 && block[end - 1].trim() === '') end--;
  return { body: block.slice(0, end), blank: block.slice(end) };
}

function seq(from, to) {
  const out = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

/* Two siblings sit back to back, so the swap is one rewrite of the lines they
 * cover together. What a block is stays outside: a heading and a bullet differ
 * in where the block ends and in who the neighbour is, and in nothing that
 * happens after that, so those two answers arrive as functions.
 *
 * The blank lines stay where they were rather than travelling with the section
 * that trailed them. They belong to the gap and to the end of the file, not to
 * either section: carrying them along makes the last section arrive with a gap
 * behind it and the file end on a blank line it never had.
 *
 * What comes out is the new order of the old lines, not just the new text.
 * Everything that has to follow a line to where it landed reads that: the
 * caret, and every heading that was folded before the swap. */
function swapBlocks(lines, blocks, index, dir, endOf, siblingOf) {
  const other = siblingOf(index, dir);
  if (other === null) return null;

  const first = Math.min(index, other);
  const second = Math.max(index, other);
  const start = blocks[first].line;
  const middle = endOf(first);
  const end = endOf(second);
  // siblings are adjacent by definition; anything else is a bug upstream, and
  // rewriting a range that holds a third block would lose it
  if (middle !== blocks[second].line) return null;

  const above = splitTrailingBlank(lines.slice(start, middle));
  const below = splitTrailingBlank(lines.slice(middle, end));
  const aboveBody = start + above.body.length;
  const belowBody = middle + below.body.length;

  const order = seq(middle, belowBody)          // the section coming up
    .concat(seq(aboveBody, middle))             // the gap that sat between them
    .concat(seq(start, aboveBody))              // the section going down
    .concat(seq(belowBody, end));               // whatever ended the range

  const movedAt = order.indexOf(blocks[index].line);
  /* The offset of that heading inside the text being written, not inside the
   * text being replaced. A dispatch resolves its selection against the new
   * document, and the two sections rarely have the same lengths, so the old
   * offset of the same line number lands somewhere else, usually a line down. */
  let movedOffset = 0;
  for (let i = 0; i < movedAt; i++) movedOffset += lines[order[i]].length + 1;

  return {
    from: start,
    to: end,
    other,
    order,
    lines: order.map((line) => lines[line]),
    // where the block that was asked to move ended up, so the caret can follow
    movedLine: start + movedAt,
    movedOffset,
  };
}

function swapSections(lines, headings, index, dir) {
  return swapBlocks(
    lines,
    headings,
    index,
    dir,
    (i) => sectionEnd(headings, i, lines.length),
    (i, d) => siblingIndex(headings, i, d)
  );
}

function swapItems(lines, fenced, items, index, dir) {
  const swap = swapBlocks(
    lines,
    items,
    index,
    dir,
    (i) => itemEnd(lines, fenced, items, i),
    (i, d) => itemSibling(lines, fenced, items, i, d)
  );
  return swap ? keepNumbers(swap, lines, items[index], items[swap.other]) : null;
}

/* A numbered list reads as its own order, so the numbers stay where they are
 * and only what is written under them changes place: swapping 1 with 2 leaves
 * a 1 and a 2, not a 2 above a 1. Bullets carry no such thing and are left as
 * they are. Only the two markers move, so a list numbered 1, 1, 1 stays that
 * way, which is what it already said. */
function keepNumbers(swap, lines, a, b) {
  const number = /^([ \t]*)(\d{1,9})([.)])/;
  const first = lines[a.line].match(number);
  const second = lines[b.line].match(number);
  if (!first || !second) return swap;

  const at = swap.order.indexOf(a.line);
  const bt = swap.order.indexOf(b.line);
  if (at === -1 || bt === -1) return swap;

  const out = swap.lines.slice();
  out[at] = lines[a.line].replace(number, '$1' + second[2] + '$3');
  out[bt] = lines[b.line].replace(number, '$1' + first[2] + '$3');

  // a marker may have changed width, and the caret is an offset into this text
  let movedOffset = 0;
  for (let i = 0; i < swap.movedLine - swap.from; i++) movedOffset += out[i].length + 1;
  return Object.assign({}, swap, { lines: out, movedOffset });
}

/* An offset into the text being written, for a caret that sat on a line that
 * moved. Never counted against the text being replaced: the two blocks rarely
 * have the same length, and the same offset there lands elsewhere. */
function caretOffset(swap, line, column) {
  const at = line - swap.from;
  if (at < 0 || at >= swap.lines.length) return null;
  let offset = 0;
  for (let i = 0; i < at; i++) offset += swap.lines[i].length + 1;
  return offset + Math.min(column, swap.lines[at].length);
}

// Original line to where it landed, both counted from zero.
function movedLines(swap) {
  const moves = new Map();
  swap.order.forEach((original, offset) => moves.set(original, swap.from + offset));
  return moves;
}

/* Folds are kept at positions, and the swap pulls the text out from under them:
 * left alone, a collapsed section comes back expanded and whatever took its
 * place shows up collapsed. Lines are numbered from one here, the way an editor
 * counts them. Folds outside the rewritten range never moved and are left out. */
function movedFoldLines(swap, foldLines) {
  const moves = movedLines(swap);
  const out = [];
  for (const number of foldLines) {
    const original = number - 1;
    if (original < swap.from || original >= swap.to) continue;
    const moved = moves.get(original);
    if (moved !== undefined) out.push(moved + 1);
  }
  return out;
}

function headingIndexAt(headings, lineNumber) {
  for (const heading of headings) {
    if (heading.line === lineNumber - 1) return heading.index;
  }
  return -1;
}

// Which lines are folded shut right now, counted from one.
function foldedLines(state) {
  const numbers = [];
  try {
    const iter = foldedRanges(state).iter();
    while (iter.value) {
      numbers.push(state.doc.lineAt(iter.from).number);
      iter.next();
    }
  } catch (err) {
    console.error('[heading-reorder] could not read the folds', err);
  }
  return numbers;
}

/* Fold again where the sections landed. The rewrite is one big replacement, so
 * the folds that were inside it do not survive being mapped through it: what is
 * left there is cleared, then each line that was folded before is folded where
 * it is now. A frame later, because whether a line can fold is answered from the
 * syntax tree, and that has the new text only after the change has settled. */
function refold(view, swap, wanted) {
  window.requestAnimationFrame(() => {
    try {
      const doc = view.state.doc;
      if (swap.to > doc.lines) return;
      const from = doc.line(swap.from + 1).from;
      const to = doc.line(swap.to).to;

      const stale = [];
      const iter = foldedRanges(view.state).iter();
      while (iter.value) {
        if (iter.from >= from && iter.from <= to) stale.push({ from: iter.from, to: iter.to });
        iter.next();
      }
      if (stale.length) view.dispatch({ effects: stale.map((range) => unfoldEffect.of(range)) });

      const effects = [];
      for (const number of wanted) {
        if (number < 1 || number > view.state.doc.lines) continue;
        const line = view.state.doc.line(number);
        const range = foldable(view.state, line.from, line.to);
        if (range) effects.push(foldEffect.of(range));
      }
      if (effects.length) view.dispatch({ effects });
    } catch (err) {
      console.error('[heading-reorder] could not put the folds back', err);
    }
  });
}

function moveSection(view, lineNumber, dir) {
  const doc = view.state.doc;
  const { lines, headings } = parseHeadings(doc.toString());
  const index = headingIndexAt(headings, lineNumber);
  if (index === -1) return false;

  const swap = swapSections(lines, headings, index, dir);
  if (!swap) return false;

  const from = doc.line(swap.from + 1).from;
  const to = doc.line(swap.to).to;
  const cursor = view.state.selection.main;
  const inside = cursor.from >= from && cursor.to <= to;
  const wanted = movedFoldLines(swap, foldedLines(view.state));

  const spec = { changes: { from, to, insert: swap.lines.join('\n') } };
  /* Only when the caret was in what moved. Left alone it would be remapped to
   * the same offset, which after the swap is the middle of the other section. */
  if (inside) spec.selection = { anchor: from + swap.movedOffset };
  view.dispatch(spec);

  if (wanted.length) refold(view, swap, wanted);
  return true;
}

/* The same move, from the bullet the cursor is in. What changes is the caret:
 * a heading is moved from its own line, while a bullet is usually moved while
 * writing inside it, so the caret keeps the line it was on and the column it
 * was at instead of being dropped at the start of the marker. */
function moveItem(view, lineNumber, dir) {
  const doc = view.state.doc;
  const { lines, items, fenced } = parseList(doc.toString());
  const index = itemAt(lines, fenced, items, lineNumber);
  if (index === -1) return false;

  const swap = swapItems(lines, fenced, items, index, dir);
  if (!swap) return false;

  const from = doc.line(swap.from + 1).from;
  const to = doc.line(swap.to).to;
  const cursor = view.state.selection.main;
  const wanted = movedFoldLines(swap, foldedLines(view.state));

  let anchor = null;
  if (cursor.from >= from && cursor.to <= to) {
    const line = doc.lineAt(cursor.head);
    const landed = movedLines(swap).get(line.number - 1);
    const offset = landed === undefined ? null : caretOffset(swap, landed, cursor.head - line.from);
    anchor = from + (offset === null ? swap.movedOffset : offset);
  }

  const spec = { changes: { from, to, insert: swap.lines.join('\n') } };
  if (anchor !== null) spec.selection = { anchor };
  view.dispatch(spec);

  if (wanted.length) refold(view, swap, wanted);
  return true;
}

/* What alt+arrow does on this line. A heading first: a line is one or the
 * other, and never both. A heading with no sibling that way stays put rather
 * than falling through to a line move, which would tear it off its section. A
 * bullet with no sibling falls through, because Obsidian's own move knows how
 * to take it out of its parent. */
/* An indented bullet with no list above it: right under a heading, a
 * paragraph or the top of the note. Markdown reads that as an indented code
 * block, so Obsidian's Shift+Tab takes it for code and unindents the one line,
 * leaving the children behind. This is the bullet Tab put there with its
 * children, so here they come back out with it.
 *
 * Returns the edits, one per line that loses a level, or null when the line
 * sits in a real list and Obsidian's own unindent is the right one. */
function orphanUnindent(text, lineIndex) {
  const { lines, fenced } = parseList(text);
  const line = lines[lineIndex];
  if (line === undefined || fenced[lineIndex]) return null;
  if (!ITEM.test(line) || indentWidth(line) === 0) return null;
  for (let i = lineIndex - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    if (fenced[i]) break;
    if (ITEM.test(lines[i])) return null;
    if (indentWidth(lines[i]) === 0) break;
  }
  const indent = indentWidth(line);
  const edits = [];
  for (let i = lineIndex; i < lines.length; i++) {
    const text = lines[i];
    if (i > lineIndex && !fenced[i] && text.trim() !== '' && indentWidth(text) <= indent) break;
    if (text.trim() === '') continue;
    const remove = text[0] === '\t' ? 1 : Math.min(4, text.match(/^ */)[0].length);
    if (remove > 0) edits.push({ line: i, remove });
  }
  return edits;
}

function blockMoveAt(text, lineNumber, dir) {
  const { headings } = parseHeadings(text);
  const heading = headingIndexAt(headings, lineNumber);
  if (heading !== -1) return siblingIndex(headings, heading, dir) === null ? 'none' : 'section';

  const { lines, items, fenced } = parseList(text);
  const item = itemAt(lines, fenced, items, lineNumber);
  if (item !== -1 && itemSibling(lines, fenced, items, item, dir) !== null) return 'item';
  return 'native';
}

function arrowsFor(headings, index) {
  return { up: siblingIndex(headings, index, -1) !== null, down: siblingIndex(headings, index, 1) !== null };
}

class ArrowsWidget extends WidgetType {
  constructor(plugin, up, down) {
    super();
    this.plugin = plugin;
    this.up = up;
    this.down = down;
  }

  eq(other) {
    return other.up === this.up && other.down === this.down;
  }

  toDOM(view) {
    const el = document.createElement('span');
    el.className = 'heading-reorder-arrows';
    // the line around it is text being edited, this is not
    el.contentEditable = 'false';

    const arrow = (dir, icon, label) => {
      const button = el.createSpan({
        cls: 'heading-reorder-arrow' + (dir === -1 ? ' is-up' : ' is-down'),
      });
      if (obsidian.setIcon) obsidian.setIcon(button, icon);
      const enabled = dir === -1 ? this.up : this.down;
      if (!enabled) {
        button.addClass('is-disabled');
        button.setAttribute('title', `No sibling heading ${dir === -1 ? 'above' : 'below'} this one`);
        return;
      }
      button.setAttribute('title', label);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        /* Read the line off the DOM at click time. The widget outlives edits
         * above it, and a line number stored when it was built would by then
         * point at whatever has since moved into that spot. */
        try {
          const line = view.state.doc.lineAt(view.posAtDOM(el));
          moveSection(view, line.number, dir);
        } catch (err) {
          console.error('[heading-reorder] could not move the section', err);
        }
      });
    };

    arrow(-1, 'chevron-up', 'Swap this section with the one above');
    arrow(1, 'chevron-down', 'Swap this section with the one below');
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(view, plugin) {
  const ranges = [];
  const doc = view.state.doc;
  const { headings } = parseHeadings(doc.toString());
  if (!headings.length) return Decoration.none;

  const byLine = new Map();
  for (const heading of headings) byLine.set(heading.line + 1, heading.index);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const index = byLine.get(line.number);
      if (index !== undefined) {
        const { up, down } = arrowsFor(headings, index);
        // a heading with no sibling either way has nothing to swap with, and an
        // arrow that can never do anything is furniture
        if (up || down) {
          ranges.push(Decoration.line({ class: 'heading-reorder-line' }).range(line.from));
          ranges.push(
            Decoration.widget({ widget: new ArrowsWidget(plugin, up, down), side: -1 }).range(line.from)
          );
        }
      }
      pos = line.to + 1;
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(ranges, true);
}

function makeViewPlugin(plugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = guarded(() => buildDecorations(view, plugin));
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = guarded(() => buildDecorations(update.view, plugin));
        }
      }
    },
    { decorations: (value) => value.decorations }
  );
}

// A throw here takes down every decoration in the editor, not only this one.
function guarded(fn) {
  try {
    return fn();
  } catch (err) {
    console.error('[heading-reorder] decorations failed, drawing none this pass', err);
    return Decoration.none;
  }
}

const DEFAULT_SETTINGS = {
  alwaysShow: false,
};

/* The edits for the cursor's line, or null. Only a single cursor on a single
 * line: a selection across lines goes to Obsidian as it always did. */
function orphanEdits(cm) {
  const { state } = cm;
  if (state.selection.ranges.length !== 1) return null;
  const { from, to } = state.selection.main;
  const line = state.doc.lineAt(from);
  if (state.doc.lineAt(to).number !== line.number) return null;
  return orphanUnindent(state.doc.toString(), line.number - 1);
}

function unindentOrphan(cm) {
  const edits = orphanEdits(cm);
  if (!edits) return false;
  const { doc } = cm.state;
  const changes = edits.map(({ line, remove }) => {
    const from = doc.line(line + 1).from;
    return { from, to: from + remove, insert: '' };
  });
  cm.dispatch({ changes, userEvent: 'delete.dedent' });
  return true;
}

class HeadingReorderPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.applyAlwaysShow();

    this.registerEditorExtension(Prec.highest(makeViewPlugin(this)));
    this.addSettingTab(new HeadingReorderSettingTab(this.app, this));

    /* One rule for headings and bullets alike: alt moves the block with
     * everything under it, shift+alt moves the line alone.
     *
     * Alt+arrow is free out of the box: the window manager has nothing on it,
     * Obsidian strips it out of CodeMirror's default keymap, and its own "Move
     * line up/down" ships with no key. A key the user saved for those commands
     * wins over a plugin default, though, so whoever bound alt to them has to
     * take it off. Not ctrl+alt, which never arrives: GNOME takes ctrl+alt+arrow
     * for switching workspace. */
    for (const dir of [-1, 1]) {
      const way = dir === -1 ? 'up' : 'down';
      const key = dir === -1 ? 'ArrowUp' : 'ArrowDown';

      this.addCommand({
        id: `move-block-${way}`,
        name: `Move the section or list item ${way}, with everything under it`,
        hotkeys: [{ modifiers: ['Alt'], key }],
        editorCheckCallback: (checking, editor) => {
          const cm = editor && editor.cm;
          if (!cm) return false;
          const line = editor.getCursor().line + 1;
          const move = blockMoveAt(cm.state.doc.toString(), line, dir);
          if (move === 'none') return false;
          if (checking) return true;
          if (move === 'section') moveSection(cm, line, dir);
          else if (move === 'item') moveItem(cm, line, dir);
          // a plain line, or a bullet stepping out of its parent: Obsidian's own
          // move handles both, and the plugin has nothing to add there
          else editor.exec(dir === -1 ? 'swapLineUp' : 'swapLineDown');
          return true;
        },
      });

      this.addCommand({
        id: `move-line-${way}`,
        name: `Move only this line ${way}`,
        hotkeys: [{ modifiers: ['Shift', 'Alt'], key }],
        /* Obsidian's own line move takes a bullet's children along since 1.15,
         * which left no way to move just the one line. CodeMirror's still does
         * exactly that, on a heading as much as on a bullet. */
        editorCheckCallback: (checking, editor) => {
          const cm = editor && editor.cm;
          if (!cm) return false;
          if (!checking) (dir === -1 ? moveLineUp : moveLineDown)(cm);
          return true;
        },
      });
    }

    /* Ctrl+Tab and Ctrl+Shift+Tab are Obsidian's "Go to next/previous tab".
     * Here they indent on a bullet and switch tabs everywhere else.
     *
     * Ctrl+Tab indents only the cursor's line: Obsidian's Tab takes a bullet's
     * children along since 1.15, CodeMirror's indentMore does not.
     * Ctrl+Shift+Tab is Shift+Tab with ctrl still down, so Ctrl+Tab is undone
     * without letting go.
     *
     * App defaults are matched before plugin ones, and the user's saved keys
     * before both: the tab commands keep only Ctrl+PageDown/Up in the user's
     * hotkeys, and the switching comes from here. Never a check that says no:
     * the key would go on to nobody. */
    const tabKey = (id, modifiers, onBullet, tabCommand) => this.addCommand({
      id,
      name: `${id === 'indent-line' ? 'Indent only this line' : 'Unindent, as Shift+Tab does'} on a bullet, switch tabs elsewhere`,
      hotkeys: [{ modifiers, key: 'Tab' }],
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editor = view && view.editor;
        if (editor && editor.cm && editor.hasFocus() && ITEM.test(editor.getLine(editor.getCursor().line))) {
          onBullet(editor);
        } else {
          this.app.commands.executeCommandById(tabCommand);
        }
      },
    });
    tabKey('indent-line', ['Ctrl'], (editor) => indentMore(editor.cm), 'workspace:next-tab');
    tabKey('unindent', ['Ctrl', 'Shift'], (editor) => {
      if (!unindentOrphan(editor.cm)) editor.unindentList();
    }, 'workspace:previous-tab');

    /* Shift+Tab only claims the bullet Obsidian mistakes for code. Anywhere
     * else the check says no, and the key goes on to Obsidian's own unindent. */
    this.addCommand({
      id: 'unindent-first-bullet',
      name: 'Unindent a first bullet with its children',
      hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
      editorCheckCallback: (checking, editor) => {
        const cm = editor && editor.cm;
        if (!cm) return false;
        if (checking) return orphanEdits(cm) !== null;
        return unindentOrphan(cm);
      },
    });
  }

  onunload() {
    document.body.classList.remove('heading-reorder-always');
  }

  applyAlwaysShow() {
    document.body.classList.toggle('heading-reorder-always', this.settings.alwaysShow);
  }

  async saveSettings() {
    this.applyAlwaysShow();
    await this.saveData(this.settings);
  }
}

class HeadingReorderSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName('Always show the arrows')
      .setDesc('Off: they appear when the pointer is on the heading. On: they stay, which is easier to find and noisier to read.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.alwaysShow).onChange(async (value) => {
          this.plugin.settings.alwaysShow = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

module.exports = HeadingReorderPlugin;
module.exports.__test = {
  blockMoveAt,
  orphanUnindent,
  parseHeadings,
  sectionEnd,
  siblingIndex,
  splitTrailingBlank,
  swapSections,
  movedLines,
  movedFoldLines,
  headingIndexAt,
  arrowsFor,
  indentWidth,
  parseList,
  itemEnd,
  itemSibling,
  itemAt,
  swapItems,
  keepNumbers,
  caretOffset,
};
