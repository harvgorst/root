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
  ok((await app.page.textContent('#ce-sug')).includes('already on this plan'), 'carrot marked as already on this plan');
  await app.page.fill('#ce-name', 'x'); ok(await app.page.isHidden('#ce-sug'), 'hidden for one letter');
});

test('a new garden starts with no crops; the Crops page shows only its own', async open => {
  const app = await openNow(open);
  ok(await app.page.locator('#lib [data-cid]').count() > 0, 'older garden keeps its crops');
  await app.page.selectOption('#plotSel', '__new');
  await app.page.fill('#np-name', 'Second plot'); await app.page.click('#newPlotForm [type=submit]'); await app.page.waitForTimeout(200);
  eq(await app.page.locator('#lib [data-cid]').count(), 0, 'new garden list is empty');
  ok((await app.page.textContent('#lib')).includes('No crops in this garden'), 'empty list explains itself');
  await app.go('crops');
  eq(await app.page.locator('#dbTable [data-pick]').count(), 0, 'Crops page is empty too');
  await app.page.click('#dbAdd'); await app.page.fill('#ce-name', 'carr');
  const sug = await app.page.textContent('#ce-sug');
  ok(sug.includes('Edible Plant Database') && !sug.includes('already on this plan'), 'search offers only the database');
  await app.page.click('#ce-sug [data-sug="0"]'); await app.page.click('[data-act=saveCrop]'); await app.page.waitForTimeout(200);
  eq(await app.page.locator('#dbTable [data-pick]').count(), 1, 'the new crop is the only one');
  await app.page.waitForTimeout(800);
  const plots = await Promise.all((await app.keys('plots/')).map(k => app.store(k)));
  eq(plots.find(p => p.name === 'Second plot')?.lib?.length, 1, 'list saved with the garden');
  await app.page.selectOption('#plotSel', 'now'); await app.page.waitForTimeout(200);
  ok(!(await app.page.textContent('#dbTable')).includes('Daucus') && (await app.page.locator('#dbTable [data-pick]').count()) > 1, 'the other garden doesn’t get it');
});

test('dragging the plot edge changes its size; the top edge shifts everything down', async open => {
  const app = await openNow(open);
  const st = async () => { await app.page.waitForTimeout(900); const g = await app.store('plots/now'); return { w: g.width, d: g.depth, x: g.areas[0]?.x, y: g.areas[0]?.y }; };
  const g0 = await st();
  const box = async sel => app.page.locator(sel).boundingBox();
  let r = await box('#map [data-e=r]');
  await app.page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await app.page.mouse.down();
  await app.page.mouse.move(r.x + r.width / 2 + 60, r.y + r.height / 2, { steps: 4 }); await app.page.mouse.up(); await app.page.waitForTimeout(200);
  const g1 = await st();
  ok(g1.w > g0.w && g1.d === g0.d && g1.x === g0.x, `right edge widens the plot (${g0.w} → ${g1.w})`);
  r = await box('#map [data-e=t]');
  await app.page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await app.page.mouse.down();
  await app.page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 - 50, { steps: 4 }); await app.page.mouse.up(); await app.page.waitForTimeout(200);
  const g2 = await st();
  ok(g2.d > g0.d && Math.abs((g2.y - g0.y) - (g2.d - g0.d)) < 0.02, 'top edge adds ground above and moves beds down with it');
  await app.page.click('#undoBtn');
  eq((await st()).d, g0.d, 'undo restores the size');
});

test('crops can be deleted from the Crops page one at a time or several at once, but not while planted', async open => {
  const seed = sample(); for (const n of ['Leek', 'Pea', 'Radish', 'Swede']) seed['crops/' + n.toLowerCase()] = { name: n, group: 'other', spacingCm: 10, rowCm: 30, variety: '', notes: '' };
  const app = await opener(open)(seed, { hash: '#crops' }); await app.page.selectOption('#plotSel', 'now'); await app.page.waitForTimeout(100);
  const row = name => app.page.locator('#dbTable tbody tr', { hasText: name });
  ok(await row('Carrot').locator('[data-del]').isDisabled() && await row('Carrot').locator('[data-pick]').isDisabled(), 'planted crop cannot be deleted or picked');
  const count = () => app.page.locator('#dbTable tbody tr').count(), before = await count();
  const free = app.page.locator('#dbTable [data-del]:not([disabled])').first(), id = await free.getAttribute('data-del');
  await free.click();
  ok((await app.page.textContent('#dbTable')).includes('Delete '), 'asks to confirm in the row');
  await app.page.keyboard.press('Escape');
  eq(await app.page.locator('#dbTable [data-delyes]').count(), 0, 'Escape keeps it');
  await app.page.locator(`#dbTable [data-del="${id}"]`).click(); await app.page.click('#dbTable [data-delyes]'); await app.page.waitForTimeout(300);
  eq(await count(), before - 1, 'row gone');
  await app.page.waitForTimeout(800);
  ok(!(await app.store('plots/now')).lib.includes(id), 'taken off this garden’s saved list');
  const picks = app.page.locator('#dbTable [data-pick]:not([disabled])');
  await picks.nth(0).click(); await picks.nth(1).click(); await picks.nth(2).click();
  ok((await app.page.textContent('#dbCount')).includes('3 selected'), 'shows how many are selected');
  await app.page.click('#bulkDel'); await app.page.click('#bulkYes'); await app.page.waitForTimeout(300);
  eq(await count(), before - 4, 'three more gone at once');
  await app.page.click('[data-pickall]');
  const n = await app.page.locator('#dbTable [data-pick]:checked').count();
  eq(n, await app.page.locator('#dbTable [data-pick]:not([disabled])').count(), 'header box selects every crop that can go');
});

test('the crop data is credited in Preferences', async open => {
  const app = await openNow(open, { hash: '#preferences' });
  const t = await app.page.textContent('#prefsView');
  ok(t.includes('Edible Plant Database') && t.includes('CC BY 4.0') && t.includes('GROW Consortium'), 'credit and licence shown');
});

test('welcome guide: shown on a first visit, steps through, highlights, and stays closed after', async open => {
  const app = await open({}, { welcome: true });
  ok(!(await app.page.isHidden('#welcome')), 'guide open on first visit');
  ok((await app.page.textContent('#welcomeBody')).includes('Welcome to root'), 'first step');
  await app.page.click('#wlNext'); await app.page.click('#wlNext');
  ok((await app.page.textContent('#wlH')).includes('List the crops'), 'third step is choosing crops, before drawing');
  ok(await app.page.locator('#addCropBtn.wl-target').count() === 1, 'Add crop highlighted');
  await app.page.click('#wlNext');
  ok((await app.page.textContent('#wlH')).includes('Draw beds'), 'then drawing beds');
  ok(await app.page.locator('#tools.wl-target').count() === 1, 'tool strip highlighted');
  await app.page.keyboard.press('ArrowLeft');
  await app.page.keyboard.press('ArrowLeft');
  ok((await app.page.textContent('#wlH')).includes('Set up your plot'), 'arrow key goes back');
  await app.page.click('[data-wl-go="8"]');
  ok((await app.page.textContent('#wlH')).includes('start your own') && (await app.page.textContent('#welcomeBody')).includes('clean slate'), 'ends by sending you to a clean plot');
  eq(await app.page.textContent('#wlNext'), 'Start planning', 'last step');
  await app.page.click('#wlNext');
  ok(await app.page.isHidden('#welcome'), 'closed');
  eq(await app.page.locator('.wl-target').count(), 0, 'highlight removed');
  await app.reload();
  ok(await app.page.isHidden('#welcome'), 'not shown again after a reload');
  await app.page.click('#guideBtn');
  ok(!(await app.page.isHidden('#welcome')), 'Guide button reopens it');
  await app.page.keyboard.press('Escape');
  ok(await app.page.isHidden('#welcome'), 'Escape closes it');
});

test('welcome guide: Skip closes it, and Preferences can show it again', async open => {
  const app = await open({}, { welcome: true, hash: '#preferences' });
  await app.page.click('[data-wl=skip]');
  ok(await app.page.isHidden('#welcome'), 'skipped');
  await app.go('preferences');
  await app.page.click('[data-act=openGuide]');
  ok(!(await app.page.isHidden('#welcome')), 'reopened from Preferences');
  eq(await app.page.evaluate(() => location.hash), '#plan', 'guide shows the plan behind it');
});

test('crops from the search are marked as coming from the database, with an About panel', async open => {
  const app = await openNow(open, { hash: '#crops' });
  await app.page.click('#dbAdd'); await app.page.fill('#ce-name', 'kohl');
  ok((await app.page.textContent('#ce-sug .src')).includes('Edible Plant Database'), 'dropdown names the source');
  await app.page.click('#ce-sug [data-act=aboutEpd]');
  ok(!(await app.page.isHidden('#epdModal')), 'About opens from the dropdown');
  ok(await app.page.evaluate(() => getComputedStyle(document.getElementById('epdModal')).zIndex > getComputedStyle(document.getElementById('cropModal')).zIndex), 'About sits above the crop form');
  const about = await app.page.textContent('#epdModal');
  ok(about.includes('146 edible plants') && about.includes('Atlantic Central') && about.includes('Creative Commons Attribution 4.0'), 'facts and licence shown');
  await app.page.keyboard.press('Escape');
  ok(await app.page.isHidden('#epdModal') && !(await app.page.isHidden('#cropModal')), 'Escape closes About, the crop form stays');
  await app.page.click('#ce-sug [data-sug="0"]');
  ok((await app.page.textContent('#cropModalBody')).includes('About the database'), 'form note links to About');
  await app.page.click('[data-act=saveCrop]'); await app.page.waitForTimeout(200);
  const row = app.page.locator('#dbTable tr', { hasText: 'Kohlrabi' });
  eq((await row.locator('td').nth(9).textContent()).trim(), 'Database', 'Source column says Database');
  eq((await app.page.locator('#dbTable tr', { hasText: 'Carrot' }).locator('td').nth(9).textContent()).trim(), 'Your own', 'other crops say Your own');
  await app.go('plan');
  eq(await app.page.locator('#lib [data-cid] .ex.db').count(), 1, 'library tags the database crop');
});

for (const theme of ['drafting', 'eiderdown', 'woodwork', 'xp', 'root']) test(`every page renders in ${theme}`, async open => {
  const app = await openNow(open, { theme });
  for (const h of ['plan', 'list', 'calendar', 'crops', 'preferences']) { await app.go(h); await app.page.waitForTimeout(50); }
  eq(app.errors, [], 'no page errors');
});

run();
