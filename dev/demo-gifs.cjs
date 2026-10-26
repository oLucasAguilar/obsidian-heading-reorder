const { open, sleep } = require('./obsidian-demo.cjs');
const P = require('path').resolve(__dirname, '..'), T = process.env.THEME, O = process.env.OUTDIR || require('path').resolve(__dirname, '../docs');
const PLAN = '## Soup\n\nLeeks and potatoes.\n\n## Bread\n\n- Flour\n\t- 500 g, whole wheat\n\t- sifted twice\n- Water\n\t- 350 ml\n\t- warm, not hot\n- Salt\n';
(async () => {
  const d = await open({ id: 'heading-reorder', pluginDir: P, files: ['main.js', 'manifest.json', 'styles.css'], theme: T, width: 640, height: 500,
    css: '.markdown-source-view.mod-cm6 .cm-contentContainer{margin-left:40px!important}', notes: { 'Plan.md': PLAN }, openNote: 'Plan' });
  await d.cursor(0, 0); await d.js(() => document.activeElement.blur()); await sleep(600); await d.hold(1500);
  // hover the Bread heading: the arrows show up in the margin; up swaps the whole section with Soup
  const h = await d.box('.cm-line.heading-reorder-line', 1);
  await d.pointer(h.x + 40, h.y + h.height / 2, { steps: 16, ms: 50 }); await sleep(300); await d.hold(1000);
  const up = await d.js(() => { const line = document.querySelectorAll('.cm-line.heading-reorder-line')[1];
    const a = [...line.querySelectorAll('.heading-reorder-arrow')].map(x => x.getBoundingClientRect()).filter(r => r.width > 0)[0];
    return { x: a.x + a.width / 2, y: a.y + a.height / 2 }; });
  await d.pointer(up.x, up.y, { steps: 10, ms: 55 }); await d.hold(700); await d.click(2200);
  // a bullet takes everything under it: click Water, then Shift+Alt+Up
  const w = await d.textEnd('.cm-line', 'Water');
  await d.pointer(w.x, w.y, { steps: 16, ms: 50 }); await d.hold(500);
  await d.page.mouse.down(); await d.page.mouse.up(); await sleep(250); await d.caret(); await d.snap(500);
  await d.pointer(w.x + 70, w.y + 60, { steps: 6, ms: 50 }); await d.hold(700); // the pointer steps aside so the caret shows
  const near = c => ({ x: c.x + 56, y: c.y - 34 });
  let c = await d.caret(); await d.badge('Shift+Alt+↑', near(c)); await d.hold(1300);
  await d.js(() => app.commands.executeCommandById('heading-reorder:move-section-up')); await sleep(300);
  c = await d.caret(); await d.badge('Shift+Alt+↑', near(c)); await d.hold(1800); await d.badge(''); await d.hold(1500); await d.caret(false); await d.hold(300);
  console.log(await d.gif(`${O}/reorder-${T}.gif`)); await d.close();
})().catch(e => { console.error(e); process.exit(1); });
