/** Run against `make serve`. Uses the monorepo's existing Playwright install. */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium, firefox, webkit } = await import(process.env.PLAYWRIGHT_MODULE || '../../../node_modules/playwright/index.mjs');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
const base = process.env.STUDIO_URL || 'http://localhost:8885';
const artifacts = process.env.ARTIFACT_DIR || '/tmp/enamel-studio-checks';
await mkdir(artifacts, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#stageStyle').selectOption('futuristic');
  assert.equal(await page.locator('#stageGrid [data-preset]').count(), 8);
  assert.equal(await page.locator('#stageGrid [data-preset="ghost-shell"]').count(), 1);
  await page.getByRole('button', { name: 'Certificate', exact: true }).click();
  await page.locator('#stageStyle').selectOption('futuristic');
  assert.equal(await page.locator('#stageGrid [data-preset]').count(), 8);
  assert.equal(await page.locator('#stageGrid [data-preset="chaos-field-report"]').count(), 1);
  await page.locator('#stageStyle').selectOption('minimal');
  assert.equal(await page.locator('#stageGrid [data-preset="swiss-record"]').count(), 1);
  assert.equal(await page.locator('#stageGrid [data-preset="ivory-honours"]').count(), 0);
  await page.locator('#stageStyle').selectOption('all');
  await page.locator('#stageGrid [data-preset="ivory-honours"]').click();
  assert.equal(await page.locator('[data-path="text.holder.font"]').inputValue(), 'script');
  assert.equal(await page.locator('#stageGrid svg').count(), 0);
  await page.locator('[data-path="text.holder.value"]').fill('Grayson Montgomery');
  await page.locator('[data-path="text.body.value"]').fill('For sharing knowledge generously and helping others find their footing through patient guidance and thoughtful work.');
  await page.waitForFunction(() => {
    const text = document.querySelector('#preview')?.textContent || '';
    return text.includes('Grayson Montgomery') && text.includes('For sharing knowledge');
  });
  assert.ok(await page.evaluate(() => {
    const texts = [...document.querySelectorAll('#preview > svg > text')];
    const name = texts.find(t => t.textContent === 'Grayson Montgomery').getBBox();
    const body = texts.find(t => t.textContent.startsWith('For sharing')).getBBox();
    return body.y > name.y + name.height;
  }), 'script descenders must clear a two-line description');
  await page.locator('[data-path="text.holder.value"]').fill('Alexandra María Fernández de la Cruz');
  await page.getByRole('button', { name: 'Design library', exact: true }).click();
  await page.locator('#presetStyle').selectOption('futuristic');
  await page.locator('#presetSearch').fill('chaos engineering');
  await page.waitForFunction(() => document.querySelectorAll('#presetGrid [data-preset]').length === 4);
  assert.equal(await page.locator('#presetGrid [data-preset="chaos-field-report"]').count(), 1);
  assert.equal(await page.locator('#presetGrid [data-preset="ghost-shell-credential"]').count(), 0);
  await page.locator('#presetSearch').fill('hacking');
  await page.locator('#presetGrid [data-preset="ghost-shell-credential"]').waitFor();
  await page.locator('#presetGrid [data-preset="ghost-shell-credential"]').click();
  assert.equal(await page.locator('[data-path="text.holder.value"]').inputValue(), 'Alexandra María Fernández de la Cruz');
  assert.equal(await page.locator('[data-path="text.title.font"]').inputValue(), 'mono');
  await page.getByRole('button', { name: 'Design library', exact: true }).click();
  await page.locator('#presetStyle').selectOption('all');
  await page.locator('#presetSearch').fill('Swiss');
  await page.locator('#presetGrid [data-preset="swiss-record"]').click();
  assert.equal(await page.locator('[data-path="text.holder.value"]').inputValue(), 'Alexandra María Fernández de la Cruz');
  assert.equal(await page.locator('[data-path="text.holder.font"]').inputValue(), 'display');

  await page.getByRole('button', { name: 'Design library', exact: true }).click();
  await page.locator('.library-save > summary').click();
  await page.locator('#localPresetName').fill('Our reusable certificate');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  const local = page.locator('#presetGrid [data-preset^="local-"]');
  await local.waitFor();
  const localId = await local.getAttribute('data-preset');
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Design library', exact: true }).click();
  await page.locator('#presetStyle').selectOption('saved');
  await page.locator(`#presetGrid [data-preset="${localId}"]`).click();
  assert.equal(await page.locator('[data-path="text.holder.value"]').inputValue(), 'Alexandra María Fernández de la Cruz');

  // Real exports exercise font embedding, vector ornaments and the PNG decoder.
  for (const format of ['SVG', 'PNG']) {
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: `Download ${format}`, exact: true }).click();
    const download = await pending;
    const file = `${artifacts}/${download.suggestedFilename()}`;
    await download.saveAs(file);
    const bytes = await readFile(file);
    if (format === 'PNG') {
      assert.equal(bytes.readUInt32BE(16), 3368);
      assert.equal(bytes.readUInt32BE(20), 2382);
    } else {
      assert.match(bytes.toString(), /data:font/);
      assert.match(bytes.toString(), /Alexandra María Fernández de la Cruz/);
      assert.match(bytes.toString(), /preview, not yet issued/);
    }
  }

  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'yes'; }; });
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.printCalled === 'yes');
  await page.emulateMedia({ media: 'print' });
  const sizes = await page.evaluate(() => {
    const sheet = document.querySelector('#print-root > svg').getBoundingClientRect();
    const seal = document.querySelector('#print-root .ins-seal').getBoundingClientRect();
    return { page: sheet.width, seal: seal.width };
  });
  assert.ok(sizes.seal < sizes.page / 4, 'the seal must not inherit the A4 page size');
  if (engine === 'chromium') await page.pdf({ path: `${artifacts}/certificate.pdf`, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  await page.getByRole('button', { name: 'Badge', exact: true }).click();
  const shapes = page.locator('[data-group="shape"]');
  await shapes.locator('label[data-element-label="circle"]').click();
  await page.locator('[data-group="centre"] > summary').click();
  await page.locator('[data-symbol-search]').fill('laurel');
  assert.equal(await page.locator('[data-element-label]:visible').filter({ has: page.locator('[data-element-type="glyph"]') }).count(), 2);
  await page.locator('label[data-element-label="laurel star"]').click();
  assert.equal(await page.evaluate(async () => (await import('/js/state.js')).design().centre.glyph), 'laurel-star');
  await page.waitForFunction(() => document.querySelector('#preview').dataset.kind === 'badge');
  await page.locator('input[data-path="centre.glyph"][value="laurel-star"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(async () => (await import('/js/state.js')).design().centre.glyph), 'laurel');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(async () => (await import('/js/state.js')).design().centre.glyph), 'laurel-star');

  // No two copies of a drawing share definitions in the live document.
  assert.ok(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('svg [id]')].map(el => el.id);
    return new Set(ids).size === ids.length;
  }));

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no page overflow at ${width}`);
    await page.screenshot({ path: `${artifacts}/studio-${width}.png` });
  }
  // Every new preset is silent in the same geometry/contrast checks as the editor.
  const warnings = await page.evaluate(async () => {
    const { PRESETS } = await import('/js/insignia/data/presets.js');
    const { state } = await import('/js/state.js');
    const { paintPreview } = await import('/js/preview.js');
    const problems = [];
    for (const p of PRESETS.filter(p => p.style)) {
      state.kind = p.kind;
      state.designs[p.kind] = structuredClone(p.design);
      paintPreview(document.querySelector('#preview'), document.querySelector('#warnings'));
      if (document.querySelector('#warnings').textContent.trim()) problems.push(p.id);
    }
    return problems;
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(errors, []);
  console.log(`${engine}: preset filters, fonts, text reuse, local persistence, SVG/PNG export, A4 print, symbols and responsive layout passed.`);
} catch (err) {
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true });
  console.error('Studio state:', await page.evaluate(() => ({
    kind: document.querySelector('[data-kind].is-on')?.dataset.kind,
    search: document.querySelector('#presetSearch')?.value,
    style: document.querySelector('#presetStyle')?.value,
    library: document.querySelector('#presetGrid')?.textContent.slice(-400),
  })));
  throw err;
} finally { await browser.close(); }
