/* Checks the rewriting behind the arrows. Obsidian's API is stubbed, so this
 * runs with plain node and needs no vault. */

const fs = require('fs');
const path = require('path');
const Module = require('module');

class Fake {
  constructor() {}
  static fromClass() { return {}; }
  static of() { return {}; }
  static define() { return { of: () => ({}) }; }
  static line() { return { range: () => ({}) }; }
  static widget() { return { range: () => ({}) }; }
  static set() { return {}; }
}
const fakeObsidian = {
  Plugin: Fake, PluginSettingTab: Fake, Setting: Fake, Notice: Fake, setIcon: () => {},
};
const fakeView = { Decoration: Fake, ViewPlugin: Fake, WidgetType: Fake };
const fakeState = { Prec: Fake };
const fakeLanguage = { foldable: () => null, foldedRanges: () => ({ iter: () => ({ value: null }) }), foldEffect: Fake, unfoldEffect: Fake };

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') return fakeObsidian;
  if (request === '@codemirror/view') return fakeView;
  if (request === '@codemirror/state') return fakeState;
  if (request === '@codemirror/language') return fakeLanguage;
  return origLoad.apply(this, arguments);
};

const mainPath = path.join(__dirname, '..', 'main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const { __test: t } = require(mainPath);

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

const note = [
  '# Recipes',            // 0
  '',                     // 1
  '## Bread',             // 2
  '- flour',              // 3
  '',                     // 4
  '### Sourdough',        // 5
  '- starter',            // 6
  '',                     // 7
  '## Cake',              // 8
  '- sugar',              // 9
  '',                     // 10
  '## Tea',               // 11
  '- leaves',             // 12
].join('\n');

const read = (text) => t.parseHeadings(text);

/* ---- reading the headings ---- */
const parsed = read(note);
check('every heading is found', parsed.headings.map((h) => h.text),
  ['Recipes', 'Bread', 'Sourdough', 'Cake', 'Tea']);
check('the level is the number of hashes', parsed.headings.map((h) => h.level), [1, 2, 3, 2, 2]);
check('the line is where it sits', parsed.headings.map((h) => h.line), [0, 2, 5, 8, 11]);
check('a hash in a fenced block is not a heading',
  read('# Real\n\n```\n# Not a heading\n```\n\n## Also real').headings.map((h) => h.text),
  ['Real', 'Also real']);
check('a tilde fence counts too',
  read('~~~\n## Hidden\n~~~\n## Shown').headings.map((h) => h.text), ['Shown']);
check('a hash with no space is not a heading', read('#tag').headings.length, 0);

/* ---- how far a section reaches ---- */
const lineCount = note.split('\n').length;
check('a section stops at the next heading of its level',
  t.sectionEnd(parsed.headings, 1, lineCount), 8);
check('and swallows the deeper ones on the way',
  note.split('\n').slice(parsed.headings[1].line, t.sectionEnd(parsed.headings, 1, lineCount)).includes('### Sourdough'),
  true);
check('a child ends where its parent does',
  t.sectionEnd(parsed.headings, 2, lineCount), 8);
check('the last section runs to the end of the file',
  t.sectionEnd(parsed.headings, 4, lineCount), lineCount);
check('the top heading owns the whole note',
  t.sectionEnd(parsed.headings, 0, lineCount), lineCount);

/* ---- who a heading may swap with ---- */
check('the next heading of the same level', t.siblingIndex(parsed.headings, 1, 1), 3);
check('deeper headings in between are skipped', t.siblingIndex(parsed.headings, 3, -1), 1);
check('the first child has nothing above it', t.siblingIndex(parsed.headings, 1, -1), null);
check('nor does it reach past its parent', t.siblingIndex(parsed.headings, 2, -1), null);
check('a lone child has nothing either way',
  [t.siblingIndex(parsed.headings, 2, 1), t.siblingIndex(parsed.headings, 2, -1)], [null, null]);
check('the last one has nothing below it', t.siblingIndex(parsed.headings, 4, 1), null);
check('a heading alone in the note gets no arrows', t.arrowsFor(read('# Only').headings, 0),
  { up: false, down: false });
check('the middle of three gets both', t.arrowsFor(parsed.headings, 3), { up: true, down: true });
check('the first of a run gets one', t.arrowsFor(parsed.headings, 1), { up: false, down: true });

/* ---- the swap ---- */
const swap = (text, line, dir) => {
  const { lines, headings } = read(text);
  const index = t.headingIndexAt(headings, line + 1);
  const out = t.swapSections(lines, headings, index, dir);
  if (!out) return null;
  return lines.slice(0, out.from).concat(out.lines, lines.slice(out.to)).join('\n');
};

check('a section takes its own lines with it', swap(note, 8, 1), [
  '# Recipes', '', '## Bread', '- flour', '', '### Sourdough', '- starter', '',
  '## Tea', '- leaves', '',
  '## Cake', '- sugar',
].join('\n'));

check('and its children when it has them', swap(note, 2, 1), [
  '# Recipes', '',
  '## Cake', '- sugar', '',
  '## Bread', '- flour', '', '### Sourdough', '- starter', '',
  '## Tea', '- leaves',
].join('\n'));

check('up and down are the same move from either end',
  swap(note, 8, -1), swap(note, 2, 1));

check('a heading with no sibling that way does not move', swap(note, 11, 1), null);
check('nor does a child reach out of its parent', swap(note, 5, 1), null);
check('the top heading has no sibling at all', swap(note, 0, 1), null);

/* The blank lines belong to the gap and to the end of the file. Carrying them
 * along would end the file on a blank line it never had, and glue the section
 * that arrived last onto the one before it. */
check('the blank line stays between them, not with the section',
  swap('## A\n- a\n\n## B\n- b', 0, 1), '## B\n- b\n\n## A\n- a');
check('a file that ended without a blank line still does',
  swap('## A\n- a\n\n## B\n- b', 0, 1).endsWith('- a'), true);
check('two blank lines are two blank lines',
  swap('## A\n- a\n\n\n## B\n- b', 0, 1), '## B\n- b\n\n\n## A\n- a');
check('a section that is only a heading moves too',
  swap('## A\n\n## B\n- b', 0, 1), '## B\n- b\n\n## A');

/* ---- where the caret lands ---- */
const moved = (text, line, dir) => {
  const { lines, headings } = read(text);
  const out = t.swapSections(lines, headings, t.headingIndexAt(headings, line + 1), dir);
  const after = lines.slice(0, out.from).concat(out.lines, lines.slice(out.to));
  return after[out.movedLine];
};
check('going down, the caret follows the heading', moved(note, 2, 1), '## Bread');
check('going up, it follows it there too', moved(note, 8, -1), '## Cake');
check('a section with children lands on its own heading', moved(note, 2, 1), '## Bread');

/* The line number was always right; the offset was read off the old text, where
 * the same line number sits somewhere else once the sections have swapped. */
const caretLine = (text, line, dir) => {
  const { lines, headings } = read(text);
  const out = t.swapSections(lines, headings, t.headingIndexAt(headings, line + 1), dir);
  const after = lines.slice(0, out.from).concat(out.lines, lines.slice(out.to)).join('\n');
  let from = 0;
  for (let i = 0; i < out.from; i++) from += lines[i].length + 1;
  return after.slice(from + out.movedOffset).split('\n')[0];
};
check('the caret offset points at the heading, not near it', caretLine(note, 2, 1), '## Bread');
check('going up the offset points at it too', caretLine(note, 8, -1), '## Cake');

const uneven = '## A\nthis line is a good deal longer than the other one\n## B\nb';
check('sections of different lengths do not throw the caret a line off',
  caretLine(uneven, 0, 1), '## A');
check('and the same the other way round', caretLine(uneven, 2, -1), '## B');

/* ---- folds follow the lines they were on ---- */
const swapOf = (text, line, dir) => {
  const { lines, headings } = read(text);
  return t.swapSections(lines, headings, t.headingIndexAt(headings, line + 1), dir);
};

const down = swapOf(note, 2, 1); // Bread, with its child, moves under Cake
check('the new order is the old lines rearranged',
  down.order.map((i) => note.split('\n')[i]), down.lines);
check('no line is lost and none is invented',
  down.order.slice().sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
check('a line outside the two sections is not in it',
  down.order.includes(0) || down.order.includes(11), false);

check('a folded heading is folded again where it landed',
  t.movedFoldLines(down, [3]), [6]); // '## Bread' on line 3 lands on line 6
check('a folded child travels with its parent',
  t.movedFoldLines(down, [6]), [9]); // '### Sourdough' goes down with Bread
check('the section that came up is folded at its new line',
  t.movedFoldLines(down, [9]), [3]); // '## Cake' comes up to the top of the range
check('two folds at once both land', t.movedFoldLines(down, [3, 9]), [6, 3]);
check('a fold outside the swapped range is left alone', t.movedFoldLines(down, [1, 12]), []);
check('nothing folded means nothing to redo', t.movedFoldLines(down, []), []);

const up = swapOf(note, 8, -1);
check('going up moves them the same way',
  t.movedFoldLines(up, [9]).concat(t.movedFoldLines(up, [3])), [3, 6]);

/* ---- what the editor is asked to do ---- */
check('the swap is one rewrite of the lines the two cover',
  /changes:\s*{\s*from,\s*to,\s*insert:/.test(source), true);
check('the line to move is read at click time, not stored',
  source.includes('view.state.doc.lineAt(view.posAtDOM(el))'), true);

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
