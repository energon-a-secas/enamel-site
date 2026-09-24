/** Visual pickers over the local Insignia catalogue. No network requests. */
import { SHAPE_LIST, shapePath } from './insignia/shapes.js';
import { GLYPH_LIST, glyphNode } from './insignia/glyphs.js';
import { svgEl } from './insignia/patterns.js';
import { escHtml } from './neorgon-dom.js';

const label = id => id.replace(/-/g, ' ');

export function elementPickerHtml(field, value) {
  const shapes = field.path === 'shape';
  const ids = shapes ? SHAPE_LIST : GLYPH_LIST;
  return `<fieldset class="element-picker" data-element-picker>
    <legend class="fld__label">${escHtml(field.label)} <span>${ids.length} local ${shapes ? 'shapes' : 'symbols'}</span></legend>
    ${shapes ? '' : '<label class="element-picker__search"><span class="sr-only">Search symbols</span><input class="fld__input" type="search" data-symbol-search placeholder="Search symbols…" autocomplete="off"></label>'}
    <div class="element-picker__grid${shapes ? '' : ' element-picker__grid--symbols'}">
      ${ids.map(id => `<label class="element-picker__item" title="${escHtml(label(id))}" data-element-label="${escHtml(label(id))}">
        <input type="radio" name="element-${field.path}" value="${id}" data-path="${field.path}" data-cast="str"${id === value ? ' checked' : ''}>
        <span class="element-picker__tile"><span data-element-icon="${id}" data-element-type="${shapes ? 'shape' : 'glyph'}" aria-hidden="true"></span>
        <span class="element-picker__name">${escHtml(label(id))}</span></span>
      </label>`).join('')}
    </div><p class="fld__hint" data-symbol-empty hidden>No symbols match. Try “star”, “laurel” or “book”.</p>
  </fieldset>`;
}

export function paintElements(root) {
  for (const host of root.querySelectorAll('[data-element-icon]')) {
    const shape = host.dataset.elementType === 'shape';
    const svg = svgEl('svg', { viewBox: shape ? '0 0 512 512' : '0 0 24 24', width: '30', height: '30', 'aria-hidden': 'true' });
    const node = shape ? svgEl('path', { d: shapePath(host.dataset.elementIcon), fill: 'currentColor' })
      : glyphNode(host.dataset.elementIcon, { color: 'currentColor', strokeWidth: 1.6 });
    if (node) svg.appendChild(node);
    host.appendChild(svg);
  }
}

export function filterSymbols(input) {
  const picker = input.closest('[data-element-picker]');
  const query = input.value.trim().toLowerCase();
  let count = 0;
  for (const item of picker.querySelectorAll('[data-element-label]')) {
    item.hidden = !item.dataset.elementLabel.includes(query);
    if (!item.hidden) count++;
  }
  picker.querySelector('[data-symbol-empty]').hidden = count > 0;
}
