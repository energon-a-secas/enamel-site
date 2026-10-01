/** Reusable designs saved on this device, independent of the working draft. */
import { normalizeDesign, validateDesign } from './insignia/schema.js';
import { presetsFor, preset } from './insignia/data/presets.js';

export const PRESET_STORAGE_KEY = 'enamel-presets-v1';
const LIMIT = 40;

export function personalPresets() {
  try {
    const rows = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter(p => p && /^local-[a-z0-9-]+$/.test(p.id) && typeof p.name === 'string'
      && p.name.length <= 60 && ['badge', 'certificate'].includes(p.kind)
      && p.design?.kind === p.kind && validateDesign(normalizeDesign(p.design)).length === 0)
      .slice(0, LIMIT).map(p => ({ ...p, local: true, style: 'saved', design: normalizeDesign(p.design) }));
  } catch { return []; }
}

export function allPresets(kind) {
  return [...personalPresets().filter(p => p.kind === kind), ...presetsFor(kind)];
}

export function findPreset(id) {
  return preset(id) || personalPresets().find(p => p.id === id) || null;
}

export function savePersonalPreset(name, design, artUrls = {}) {
  const title = name.trim();
  if (!title) throw new Error('Give this preset a name.');
  if (title.length > 60) throw new Error('Use a name of 60 characters or fewer.');
  const problems = validateDesign(design);
  if (problems.length) throw new Error(`Fix this design before saving: ${problems[0]}`);
  const rows = personalPresets();
  if (rows.length >= LIMIT) throw new Error('Your library is full. Remove a saved preset to make room.');
  const record = { id: `local-${crypto.randomUUID()}`, name: title, kind: design.kind,
    design: normalizeDesign(design), artUrls, note: 'Saved on this device.', local: true, style: 'saved' };
  try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify([record, ...rows])); }
  catch { throw new Error('This browser could not save the preset. Check that local storage is available.'); }
  return record;
}

export function removePersonalPreset(id) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(personalPresets().filter(p => p.id !== id)));
}

export function matchesPreset(p, { query = '', style = 'all' } = {}) {
  const search = [p.name, p.note, p.style, p.design.shape, p.design.centre?.glyph,
    ...(Array.isArray(p.tags) ? p.tags : [])].join(' ').toLowerCase();
  const category = p.style || (p.kind === 'badge' ? 'bold' : ['graphite', 'cold-print', 'dry-run'].includes(p.id) ? 'minimal' : 'bold');
  return (!query.trim() || search.includes(query.trim().toLowerCase())) && (style === 'all' || category === style);
}

/** Copy wording into matching slots without changing the destination styling. */
export function keepPresetText(next, previous) {
  if (next.kind !== previous.kind) return next;
  if (next.kind === 'certificate') {
    for (const key of Object.keys(next.text)) next.text[key].value = previous.text[key].value;
    next.signatures = JSON.parse(JSON.stringify(previous.signatures));
  } else {
    for (const side of ['top', 'bottom']) if (next.arcs[side] && previous.arcs[side]) next.arcs[side].text = previous.arcs[side].text;
    if (next.ribbon && previous.ribbon) next.ribbon.text = previous.ribbon.text;
  }
  return next;
}
