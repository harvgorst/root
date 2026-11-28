// Checks for root, the crop planner, run in a headless browser against a stand-in for the browser's storage.
// Run with:  node tests/smoke.js            (all tests)
//            node tests/smoke.js rotation   (only tests whose name contains "rotation")
const { open: openPage, test, ok, eq, run } = require('./harness');
const FILE = 'index.html';
const opener = open => (seed, opts = {}) => open(seed, { ...opts, file: FILE });

// a small plot: two beds, a path, carrots in bed 1 and last year's plan with carrots in bed 1 too
function sample() {
  const crop = (name, group, spacingCm, rowCm, extra = {}) => ({ name, group, spacingCm, rowCm, variety: '', sowIn: null, sowOut: [4, 6], plantOut: null, harvest: [7, 10], notes: '', ...extra });
  const beds = [{ id: 'b1', kind: 'bed', name: 'Bed 1', x: 1, y: 1, w: 1.2, h: 4 }, { id: 'b2', kind: 'bed', name: 'Bed 2', x: 3, y: 1, w: 1.2, h: 4 }, { id: 'p1', kind: 'path', name: 'Path', x: 0, y: 6, w: 10, h: 1 }];
  return {
    'settings/seeded': { at: 1 },
    'crops/carrot': crop('Carrot', 'roots', 5, 20),
    'crops/kale': crop('Kale', 'brassicas', 45, 60, { sowIn: [4, 5], plantOut: [6, 7], harvest: [9, 3] }),
    'crops/rhubarb': crop('Rhubarb', 'perennial', 90, 90),
    'plots/last': { name: 'Plot 7', year: 2025, width: 10, depth: 8, north: 0, areas: beds, crops: [{ id: 'x1', cropId: 'carrot', x: 1, y: 1, w: 1.2, h: 2 }], updatedAt: 1 },
    'plots/now': { name: 'Plot 7', year: 2026, width: 10, depth: 8, north: 0, prevId: 'last', areas: beds, updatedAt: 2,
      crops: [{ id: 'c1', cropId: 'carrot', x: 1, y: 1, w: 1.2, h: 2 }, { id: 'c2', cropId: 'rhubarb', x: 3, y: 3, w: 1.2, h: 2 }] },
  };
}
const openNow = async (open, opts) => { const app = await opener(open)(sample(), opts); await app.page.selectOption('#plotSel', 'now'); await app.page.waitForTimeout(100); return app; };

test('first run fills the library and opens the example plot', async open => {
  const app = await opener(open)({});
  ok((await app.keys('crops/')).length >= 30, 'starter crops saved');
  eq(await app.page.inputValue('#plotSel'), 'example', 'example plot open');
  ok(await app.page.locator('#map [data-kind=crop]').count() > 10, 'example crops drawn');
  eq(app.errors, [], 'no page errors');
});

test('the tab has an icon', async open => {
  const app = await opener(open)({});
  ok((await app.page.title()).startsWith('root'), 'it is root');
  ok((await app.page.$eval('link[rel=icon]', l => l.href)).startsWith('data:image/svg+xml'), 'an SVG tab icon');
  eq(await app.page.$eval('link[rel=icon]', l => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = l.href; })), true, 'it draws');
});

test('drawing a bed and a crop block saves the plan', async open => {
  const app = await openNow(open);
  await app.page.click('[data-tool=bed]');
  await app.dragPlan(6, 1, 7.2, 5);
  await app.page.click('#lib [data-cid=kale]');
  await app.dragPlan(6.1, 1.1, 7.1, 3);
  await app.page.waitForTimeout(900);
  const g = await app.store('plots/now');
  eq(g.areas.filter(a => a.kind === 'bed').length, 3, 'beds saved');
  const blk = g.crops.find(b => b.cropId === 'kale');
  ok(blk && blk.x >= 6 && blk.x + blk.w <= 7.2 + 1e-6, 'kale block kept inside its bed');
  ok((await app.page.textContent('#inspector')).includes('plants'), 'inspector counts the plants');
});

test('plant numbers come from the crop spacing', async open => {
  const app = await openNow(open);
  await app.clickPlan(1.6, 1.5);
  ok((await app.page.textContent('#i-count')).replace(/\s+/g, ' ').includes('240 plants · 6 rows of 40'), 'carrots at 5 × 20 cm in 1.2 × 2 m');
  await app.page.check('#i-across');
  ok((await app.page.textContent('#i-count')).replace(/\s+/g, ' ').includes('10 rows of 24'), 'turning the rows');
});

test('rotation clash is flagged and next year keeps perennials', async open => {
  const app = await openNow(open, { hash: '#list' });
  ok((await app.page.textContent('#listView')).includes('Same family as last year (Roots)'), 'clash in the rotation table');
  await app.go('plan');
  await app.page.click('#detailsBtn'); await app.page.click('#nextYearBtn'); await app.page.waitForTimeout(200);
  const ids = (await app.keys('plots/')).filter(k => !['plots/now', 'plots/last'].includes(k));
  eq(ids.length, 1, 'next year saved');
  const next = await app.store(ids[0]);
  eq([next.year, next.prevId, next.crops.map(b => b.cropId)], [2027, 'now', ['rhubarb']], 'next year links back and keeps only perennials');
});

test('undo, redo, nudge and duplicate', async open => {
  const app = await openNow(open);
  await app.clickPlan(1.6, 1.5);
  await app.page.keyboard.press('ArrowRight');
  await app.page.waitForTimeout(800);
  eq((await app.store('plots/now')).crops.find(b => b.id === 'c1').x, 1.1, 'nudged by the snap');
  await app.page.keyboard.press('Control+z'); await app.page.keyboard.press('Control+Shift+z'); await app.page.waitForTimeout(800);
  eq((await app.store('plots/now')).crops.find(b => b.id === 'c1').x, 1.1, 'redone');
  await app.page.keyboard.press('Control+d'); await app.page.waitForTimeout(800);
  eq((await app.store('plots/now')).crops.length, 3, 'duplicated');
  await app.page.click('#undoBtn'); await app.page.waitForTimeout(800);
  eq((await app.store('plots/now')).crops.length, 2, 'duplicate undone');
});

test('theme is chosen in Preferences and kept', async open => {
  const app = await openNow(open, { hash: '#preferences' });
  eq(await app.page.getAttribute('html', 'data-skin'), 'drafting', 'starts on Drafting table');
  await app.page.click('.thopt:has(input[value=root])'); await app.page.waitForTimeout(600);
  eq(await app.page.getAttribute('html', 'data-skin'), 'root', 'switched');
  eq((await app.store('settings/prefs')).theme, 'root', 'saved');
  await app.reload();
  eq(await app.page.getAttribute('html', 'data-skin'), 'root', 'kept after reload');
});

test('follows the SevenLayers theme until one is chosen', async open => {
  const app = await opener(open)(sample(), { theme: 'woodwork' });
  eq(await app.page.getAttribute('html', 'data-skin'), 'woodwork', 'SevenLayers theme used');
});

test('backup round trip', async open => {
  const app = await openNow(open, { hash: '#preferences' });
  await app.page.click('[data-act=bkpAll]'); await app.page.waitForTimeout(200);
  const saved = await app.saved(); eq(saved.length, 1, 'one file'); ok(/^root backup - everything - /.test(saved[0].filename), 'file name');
  const json = (await app.savedBytes(0)).toString();
  const data = JSON.parse(json); eq([data.plots.length, data.crops.length], [2, 3], 'plans and crops in the file');
  await app.page.setInputFiles('[data-restore]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) }); await app.page.waitForTimeout(400);
  const restored = (await app.keys('plots/')).length;
  eq(restored, 4, 'restored plans added alongside');
  ok((await app.page.textContent('#bkpMsg')).includes('Restored 2 plans'), 'message');
  const copies = await Promise.all((await app.keys('plots/')).filter(k => !['plots/now', 'plots/last'].includes(k)).map(k => app.store(k)));
  const newNow = copies.find(p => p.year === 2026), newLast = copies.find(p => p.year === 2025);
  ok(newNow.prevId && newNow.prevId !== 'last' && (await app.keys('plots/' + newNow.prevId)).length === 1 && newLast, 'restored years still linked to each other');
});

test('crops page edits a crop in a dialog', async open => {
  const app = await openNow(open, { hash: '#crops' });
  eq(await app.page.locator('#dbTable tbody tr').count(), 3, 'three crops listed');
  await app.page.click('#dbTable [data-edit=kale]');
  ok(!(await app.page.isHidden('#cropModal')), 'dialog open');
  await app.page.fill('#ce-var', 'Nero di Toscana'); await app.page.click('[data-act=saveCrop]'); await app.page.waitForTimeout(200);
  eq((await app.store('crops/kale')).variety, 'Nero di Toscana', 'saved');
  ok(await app.page.isHidden('#cropModal'), 'dialog closed');
});

test('typing a crop name offers crops from the Dundee data and fills in what is not set', async open => {
  const app = await openNow(open, { hash: '#crops' });
  await app.page.click('#dbAdd');
  await app.page.fill('#ce-row', '40');   // set by hand, so it must be kept
  await app.page.fill('#ce-name', 'parsn');
  ok(!(await app.page.isHidden('#ce-sug')), 'suggestions shown');
  ok((await app.page.textContent('#ce-sug')).includes('Parsnip'), 'parsnip offered');
  await app.page.click('#ce-sug [data-sug="0"]');
  eq(await app.page.inputValue('#ce-name'), 'Parsnip', 'name filled');
  eq(await app.page.inputValue('#ce-group'), 'roots', 'family filled');
  eq([await app.page.inputValue('#ce-sp'), await app.page.inputValue('#ce-row')], ['15', '40'], 'in-row spacing filled, row spacing kept');
  eq([await app.page.inputValue('#ce-sowOut-0'), await app.page.inputValue('#ce-sowOut-1'), await app.page.inputValue('#ce-harvest-0'), await app.page.inputValue('#ce-harvest-1')], ['5', '6', '11', '2'], 'months filled');
  ok((await app.page.textContent('#cropModalBody')).includes('Edible Plant Database'), 'source credited in the form');
  await app.page.click('[data-act=saveCrop]'); await app.page.waitForTimeout(200);
  const saved = await Promise.all((await app.keys('crops/')).map(k => app.store(k)));
  const pars = saved.find(c => c.name === 'Parsnip');
  ok(pars && pars.epd === true && !('_touched' in pars) && pars.rowCm === 40, 'saved with its source and without working fields');
});

test('crops already in the library are marked, and botanical names match', async open => {
  const app = await openNow(open, { hash: '#crops' });
  await app.page.click('#dbAdd');
  await app.page.fill('#ce-name', 'daucus');
  ok((await app.page.textContent('#ce-sug')).includes('Carrot'), 'found by botanical name');
  ok((await app.page.textContent('#ce-sug')).includes('in your library'), 'carrot marked as already in the library');
  await app.page.fill('#ce-name', 'x'); ok(await app.page.isHidden('#ce-sug'), 'hidden for one letter');
});

test('the crop data is credited in Preferences', async open => {
  const app = await openNow(open, { hash: '#preferences' });
  const t = await app.page.textContent('#prefsView');
  ok(t.includes('Edible Plant Database') && t.includes('CC BY 4.0') && t.includes('GROW Consortium'), 'credit and licence shown');
});

for (const theme of ['drafting', 'eiderdown', 'woodwork', 'xp', 'root']) test(`every page renders in ${theme}`, async open => {
  const app = await openNow(open, { theme });
  for (const h of ['plan', 'list', 'calendar', 'crops', 'preferences']) { await app.go(h); await app.page.waitForTimeout(50); }
  eq(app.errors, [], 'no page errors');
});

run();
