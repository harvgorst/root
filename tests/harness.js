// Shared set-up for the tests: opens root in a headless browser against the stand-in storage (mock-runtime.js).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

async function open(seed = {}, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1400, height: 900 }, timezoneId: 'Europe/London', locale: 'en-GB' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (!opts.real) {
    await page.addInitScript({ path: path.join(__dirname, 'mock-runtime.js') });
    await page.addInitScript(seed => { for (const [k, v] of Object.entries(seed)) window.__mock.store.set(k, JSON.parse(JSON.stringify(v))); }, seed);
  }
  // the welcome guide opens on a first visit; tests that aren't about it start as a returning visitor
  if (!opts.welcome) await page.addInitScript(() => { try { localStorage.setItem('apl.welcome', '1'); } catch {} });
  // opts.theme stands for the theme chosen in SevenLayers, which root follows until one is picked here
  if (opts.theme) await page.addInitScript(t => { try { localStorage.setItem('gpm.theme', t); } catch {} }, opts.theme);
  const html = fs.readFileSync(path.join(ROOT, opts.file || 'index.html'), 'utf8');
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const ready = () => page.waitForFunction(() => /Saved|Not saved/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
  await page.goto('http://app.test/' + (opts.hash || ''));
  await ready(); await page.waitForTimeout(150);
  const api = {
    page, browser, errors,
    store: key => page.evaluate(k => window.__mock.store.get(k), key),
    reload: async () => { await page.reload(); await ready(); await page.waitForTimeout(150); },
    keys: prefix => page.evaluate(p => [...window.__mock.store.keys()].filter(k => k.startsWith(p)), prefix),
    status: () => page.textContent('#status'),
    go: async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); },
    saved: () => page.evaluate(() => window.__mock.saved.map(s => ({ filename: s.filename, size: s.blob.size }))),
    savedBytes: i => page.evaluate(async i => { const u8 = new Uint8Array(await window.__mock.saved[i].blob.arrayBuffer()); let s = ''; for (let j = 0; j < u8.length; j += 8192) s += String.fromCharCode(...u8.subarray(j, j + 8192)); return btoa(s); }, i).then(b => Buffer.from(b, 'base64')),
    // click or drag on the plan at positions given in metres
    planXY: (x, y) => page.evaluate(([x, y]) => { const svg = document.getElementById('map'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const r = pt.matrixTransform(svg.getScreenCTM()); return { x: r.x, y: r.y }; }, [x, y]),
    clickPlan: async (x, y, o) => { const p = await api.planXY(x, y); await page.mouse.click(p.x, p.y, o); await page.waitForTimeout(60); },
    dragPlan: async (x1, y1, x2, y2) => { const a = await api.planXY(x1, y1), b = await api.planXY(x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(80); },
    close: () => browser.close(),
  };
  return api;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function ok(cond, msg) { if (!cond) throw new Error('expected ' + msg); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
async function run() {
  const only = process.argv.slice(2);
  let failed = 0, ran = 0;
  for (const t of tests) {
    if (only.length && !only.some(o => t.name.toLowerCase().includes(o.toLowerCase()))) continue;
    ran++;
    const t0 = Date.now(); let app = null;
    try {
      await t.fn(async (...a) => (app = await open(...a)));
      if (app && app.errors.length) throw new Error('page errors: ' + app.errors.join(' | '));
      console.log(`ok   ${t.name} (${Date.now() - t0} ms)`);
    } catch (e) { failed++; console.log(`FAIL ${t.name}\n     ${String(e.message).split('\n')[0]}`); }
    finally { if (app) await app.close().catch(() => {}); }
  }
  console.log(`\n${ran - failed} of ${ran} passed`);
  process.exit(failed ? 1 : 0);
}
module.exports = { open, test, ok, eq, run, ROOT };
