/** Preset browsing and local reuse, shared by the stage and the library. */
import { presetGrid } from './render.js';
import { allPresets, matchesPreset, savePersonalPreset, removePersonalPreset } from './preset-store.js';
import { state, design, save } from './state.js';
import { artUrl } from './insignia/draw.js';
import { $, showToast } from './utils.js';
import { openModal } from './events.js';

function filters(prefix) {
  return { query: $(`${prefix}Search`)?.value || '', style: $(`${prefix}Style`)?.value || 'all' };
}

export function paintPresetLibrary(prefix = 'preset') {
  const options = filters(prefix);
  const count = allPresets(state.kind).filter(p => matchesPreset(p, options)).length;
  const grid = $(prefix === 'stage' ? 'stageGrid' : 'presetGrid');
  if (!grid) return;
  grid.dataset.kind = state.kind;
  grid.replaceChildren(presetGrid(state.kind, state.presetId, options));
  const status = $(`${prefix}Count`);
  if (status) status.textContent = `${count} ${state.kind === 'badge' ? 'badges' : 'certificates'}`;
  if (!count) {
    const p = document.createElement('p');
    p.className = 'preset-empty';
    p.textContent = options.style === 'saved'
      ? 'No saved presets here yet. Save your current design below to use it again.'
      : 'No matching designs. Try another search or choose All styles.';
    grid.appendChild(p);
  }
}

export function openPresets() {
  paintPresetLibrary();
  openModal('presetModal');
}

export function initPresetLibrary() {
  for (const prefix of ['stage', 'preset']) {
    $(`${prefix}Search`)?.addEventListener('input', () => paintPresetLibrary(prefix));
    $(`${prefix}Style`)?.addEventListener('change', () => paintPresetLibrary(prefix));
  }
  $('localPresetForm')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const d = design();
      const refs = [d.centre?.imageRef, d.seal?.design?.centre?.imageRef].filter(Boolean);
      const urls = Object.fromEntries(refs.map(ref => [ref, artUrl(ref)]).filter(([, url]) => url));
      savePersonalPreset($('localPresetName').value, d, urls);
      save();
      $('localPresetName').value = '';
      $('presetStyle').value = 'saved';
      $('presetSearch').value = '';
      paintPresetLibrary();
      showToast('Preset saved on this device. Find it under My presets.');
    } catch (err) { showToast(err.message); }
  });
  $('presetGrid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-preset]');
    if (!button) return;
    try {
      removePersonalPreset(button.dataset.removePreset);
      paintPresetLibrary();
      $('presetStyle').focus();
      showToast('Preset removed. Your current design is still here.');
    } catch { showToast('This browser could not remove the preset.'); }
  });
}
