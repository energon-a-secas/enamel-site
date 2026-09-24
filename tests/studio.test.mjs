import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetDesign } from '../js/insignia/data/presets.js';
import { validateDesign } from '../js/insignia/schema.js';
import { fitText, textAdvance } from '../js/insignia/text-fit.js';
import { glyphProblems } from '../js/insignia/glyphs.js';
import { PRESET_STORAGE_KEY, personalPresets, savePersonalPreset,
  removePersonalPreset, keepPresetText } from '../js/preset-store.js';

test('every shipped preset is valid and independently editable', () => {
  assert.equal(new Set(PRESETS.map(p => p.id)).size, PRESETS.length);
  for (const p of PRESETS) {
    assert.deepEqual(validateDesign(p.design), [], p.id);
    const copy = presetDesign(p.id);
    copy.palette.base = '#123456';
    assert.notEqual(p.design.palette.base, '#123456', p.id);
  }
  assert.deepEqual(glyphProblems(), []);
});

test('long titles and international recipient names fit without losing text', () => {
  for (const role of ['sans', 'display', 'slab', 'mono', 'script', 'rounded']) {
    for (const value of ['Alexandra María Fernández de la Cruz', '王小明 · София Иванова', 'W'.repeat(100)]) {
      const result = fitText(value, { role, size: 106, width: 800, height: 100 });
      assert.equal(result.lines.join(''), value);
      assert.ok(result.size <= 100);
      assert.ok(textAdvance(value, role, result.size) <= 800.001);
    }
  }
});

test('body copy wraps at words, stays in its slot and preserves explicit lines', () => {
  const value = 'For sharing knowledge generously and helping others find their footing through patient guidance and thoughtful work.';
  const result = fitText(value, { role: 'sans', size: 25, width: 950, height: 64, maxLines: 2 });
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines.join(' '), value);
  assert.ok(result.size + result.leading <= 64);
  assert.deepEqual(fitText('First line\nSecond line', { role: 'sans', size: 24, width: 900, height: 64, maxLines: 2 }).lines,
    ['First line', 'Second line']);
  assert.equal(fitText('issued   24 September 2026', { role: 'mono', size: 20, width: 900, height: 40 }).lines[0],
    'issued   24 September 2026');
});

test('switching style keeps wording and signatures while retaining the new fonts', () => {
  const previous = presetDesign('ivory-honours');
  previous.text.holder.value = 'Renée Santos';
  const next = presetDesign('swiss-record');
  keepPresetText(next, previous);
  assert.equal(next.text.holder.value, 'Renée Santos');
  assert.equal(next.text.holder.font, 'display');
  next.signatures[0].name = 'Edited';
  assert.notEqual(previous.signatures[0].name, 'Edited');
});

test('personal presets survive reload, keep independent copies and handle unavailable storage', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
  const d = presetDesign('ivory-honours');
  const row = savePersonalPreset('My certificate', d);
  d.text.title.value = 'Changed later';
  assert.equal(personalPresets()[0].design.text.title.value, 'Excellence in Practice');
  removePersonalPreset(row.id);
  assert.deepEqual(personalPresets(), []);
  data.set(PRESET_STORAGE_KEY, '{broken');
  assert.deepEqual(personalPresets(), []);
  assert.throws(() => savePersonalPreset(' ', d), /name/);
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => savePersonalPreset('A useful preset', d), /could not save/);
  delete globalThis.localStorage;
});
