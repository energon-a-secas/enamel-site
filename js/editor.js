/**
 * The editor form: turns `fields.js` into controls, and one delegated listener
 * turns a control back into a write at a dotted path.
 *
 * No inline handler anywhere. Every control carries `data-path` and the
 * listener at the root reads it, which is what keeps this file the only place
 * that knows how a control becomes a design change.
 */
import { state, design } from './state.js';
import { RING_STYLES, FONT_ROLES } from './insignia/schema.js';
import { groupsFor, pairingOptions, pairingNote } from './fields.js';
import { escHtml } from './neorgon-dom.js';
import { getPath, setPath, opt, splitList, clone } from './utils.js';
import { badgeFonts, certificateFonts } from './insignia/data/fonts.js';
import { presetsFor } from './insignia/data/presets.js';

let notify = () => {};
let onPickArt = null;

/* ── control markup ────────────────────────────────────────────────────────── */

const CAST_BY_TYPE = {
  range: 'num', number: 'num', check: 'bool', list: 'list', year: 'yearOrNull',
};

function attrs(field) {
  const cast = field.cast || CAST_BY_TYPE[field.type] || 'str';
  return `data-path="${escHtml(field.path)}" data-cast="${cast}"${field.rerender ? ' data-rerender="1"' : ''}`;
}

function hint(field) {
  return field.hint ? `<span class="fld__hint">${escHtml(field.hint)}</span>` : '';
}

function selectHtml(field, value) {
  const options = field.options.map((o) => (Array.isArray(o) ? opt(o[0], value ?? '', o[1]) : opt(o, value ?? '')));
  return `<label class="fld"><span class="fld__label">${escHtml(field.label)}</span>
    <select class="fld__input" ${attrs(field)}>${options.join('')}</select>${hint(field)}</label>`;
}

function rangeHtml(field, value) {
  return `<label class="fld fld--range"><span class="fld__label">${escHtml(field.label)}
      <output class="fld__out">${escHtml(value)}</output></span>
    <input class="fld__range" type="range" min="${field.min}" max="${field.max}" step="${field.step}"
      value="${escHtml(value)}" ${attrs(field)}>${hint(field)}</label>`;
}

function colorHtml(field, value) {
  return `<label class="fld fld--color"><span class="fld__label">${escHtml(field.label)}</span>
    <span class="fld__swatchwrap">
      <input class="fld__color" type="color" value="${escHtml(value)}" ${attrs(field)}>
      <code class="fld__hex">${escHtml(value)}</code>
    </span>${hint(field)}</label>`;
}

function ringsHtml(rings) {
  const rows = rings.map((r, i) => `<div class="repeat__row">
    <select class="fld__input fld__input--mini" data-path="rings.${i}.style" data-cast="str">
      ${RING_STYLES.map((s) => opt(s, r.style)).join('')}
    </select>
    <input class="fld__input fld__input--mini" type="number" min="1" max="64" step="1" value="${escHtml(r.width)}"
      data-path="rings.${i}.width" data-cast="num" title="Weight" aria-label="Ring weight">
    <input class="fld__input fld__input--mini" type="number" min="0" max="128" step="1" value="${escHtml(r.inset)}"
      data-path="rings.${i}.inset" data-cast="num" title="Inset" aria-label="Ring inset">
    <input class="fld__color" type="color" value="${escHtml(r.color)}" data-path="rings.${i}.color" data-cast="str" aria-label="Ring colour">
    <button type="button" class="btn btn--ghost btn--sm" data-action="ring-remove" data-index="${i}">Remove</button>
  </div>`).join('');
  const add = rings.length < 3
    ? '<button type="button" class="btn btn--ghost btn--sm" data-action="ring-add">Add a ring</button>'
    : '<span class="fld__hint">Three is the most a design carries.</span>';
  return `<div class="repeat"><span class="fld__label">Rings</span>${rows}${add}
    <span class="fld__hint">Drawn outermost first. A ring follows the silhouette rather than assuming a circle.</span></div>`;
}

function signaturesHtml(sigs) {
  const rows = sigs.map((s, i) => `<div class="repeat__row">
    <input class="fld__input fld__input--mini" value="${escHtml(s.name)}" placeholder="Name"
      data-path="signatures.${i}.name" data-cast="str" aria-label="Signature name">
    <input class="fld__input fld__input--mini" value="${escHtml(s.role)}" placeholder="Role"
      data-path="signatures.${i}.role" data-cast="str" aria-label="Signature role">
    <button type="button" class="btn btn--ghost btn--sm" data-action="sig-remove" data-index="${i}">Remove</button>
  </div>`).join('');
  const add = sigs.length < 2
    ? '<button type="button" class="btn btn--ghost btn--sm" data-action="sig-add">Add a signature</button>'
    : '<span class="fld__hint">Two is the most a certificate carries.</span>';
  return `<div class="repeat"><span class="fld__label">Signatures</span>${rows}${add}</div>`;
}

function certTextHtml(field, value) {
  const p = field.path;
  return `<div class="certtext">
    <label class="fld"><span class="fld__label">${escHtml(field.label)}</span>
      <input class="fld__input" value="${escHtml(value.value)}" data-path="${p}.value" data-cast="str"></label>
    <div class="certtext__row">
      <select class="fld__input fld__input--mini" data-path="${p}.font" data-cast="str" aria-label="${escHtml(field.label)} face">
        ${FONT_ROLES.map((r) => opt(r, value.font)).join('')}
      </select>
      <input class="fld__input fld__input--mini" type="number" min="8" max="200" step="1" value="${escHtml(value.size)}"
        data-path="${p}.size" data-cast="num" aria-label="${escHtml(field.label)} size">
      <input class="fld__color" type="color" value="${escHtml(value.color)}" data-path="${p}.color" data-cast="str"
        aria-label="${escHtml(field.label)} colour">
    </div>
  </div>`;
}

function sealHtml(current) {
  // A design records the seal it holds, not where the copy came from, so a
  // certificate that already has one keeps a "leave it alone" entry rather than
  // pretending the picker knows which preset it was.
  const options = [
    current ? '<option value="__keep" selected>A badge is embedded here</option>' : '',
    `<option value=""${current ? '' : ' selected'}>No seal</option>`,
    '<option value="badge-draft">Copy the badge I am designing</option>',
    ...presetsFor('badge').map((p) => `<option value="${escHtml(p.id)}">Copy the ${escHtml(p.name)} preset</option>`),
  ];
  return `<div class="fld"><span class="fld__label">Seal</span>
    <select class="fld__input" data-action="seal-set">${options.join('')}</select>
    <span class="fld__hint">${current
      ? 'The copy is embedded by value. Editing that badge afterwards does not change this certificate.'
      : 'A seal is a whole badge document, copied in at the moment you choose it.'}</span></div>`;
}

function artHtml(current) {
  const shown = state.artUrl
    ? `<img class="art__thumb" src="${escHtml(state.artUrl)}" alt="The image in the centre of this badge">`
    : `<span class="fld__hint">${current ? 'An image is attached. Its address is resolved when the template loads.' : 'No image yet.'}</span>`;
  return `<div class="fld art"><span class="fld__label">Image</span>
    ${shown}
    <div class="toolbar">
      <button type="button" class="btn btn--secondary btn--sm" data-action="art-pick">Upload an image</button>
      ${current ? '<button type="button" class="btn btn--ghost btn--sm" data-action="art-clear">Remove it</button>' : ''}
    </div>
    <span class="fld__hint">PNG, JPEG or WEBP. It is scaled to 512 across in your browser before it is sent, and it is
    stored against the template rather than against each award, so a hundred claims serve one file.</span></div>`;
}

function inputHtml(field, value) {
  const common = `class="fld__input" ${attrs(field)}`;
  if (field.type === 'textarea') {
    return `<label class="fld"><span class="fld__label">${escHtml(field.label)}</span>
      <textarea ${common} rows="3"${field.maxlength ? ` maxlength="${field.maxlength}"` : ''}>${escHtml(value)}</textarea>${hint(field)}</label>`;
  }
  const type = field.type === 'number' || field.type === 'year' ? 'number' : 'text';
  const bounds = field.min !== undefined ? ` min="${field.min}"` : '';
  const bounds2 = field.max !== undefined ? ` max="${field.max}"` : '';
  const step = field.step !== undefined ? ` step="${field.step}"` : '';
  const shown = field.type === 'list' ? (Array.isArray(value) ? value.join(', ') : '') : (value ?? '');
  return `<label class="fld"><span class="fld__label">${escHtml(field.label)}</span>
    <input ${common} type="${type}" value="${escHtml(shown)}"${bounds}${bounds2}${step}${field.maxlength ? ` maxlength="${field.maxlength}"` : ''}>${hint(field)}</label>`;
}

function fieldHtml(field, d) {
  const value = field.path.startsWith('meta.')
    ? getPath({ meta: state.meta }, field.path)
    : getPath(d, field.path);

  switch (field.type) {
    case 'note':
      return `<p class="fld__note">${escHtml(field.body)}</p>`;
    case 'toggle':
      return `<label class="fld fld--check"><input type="checkbox" data-toggle="${escHtml(field.path)}"${value ? ' checked' : ''}>
        <span>${escHtml(field.label)}</span></label>${hint(field)}`;
    case 'check':
      return `<label class="fld fld--check"><input type="checkbox" ${attrs(field)}${value ? ' checked' : ''}>
        <span>${escHtml(field.label)}</span></label>${hint(field)}`;
    case 'select': return selectHtml(field, value);
    case 'range': return rangeHtml(field, value);
    case 'color': return colorHtml(field, value);
    case 'rings': return ringsHtml(d.rings);
    case 'signatures': return signaturesHtml(d.signatures);
    case 'certtext': return certTextHtml(field, value);
    case 'seal': return sealHtml(value);
    case 'art': return artHtml(value);
    default: return inputHtml(field, value);
  }
}

/* ── the form ──────────────────────────────────────────────────────────────── */

function pairingHtml() {
  return `<div class="editor__group"><div class="editor__body">
    <label class="fld"><span class="fld__label">Font pairing</span>
      <select class="fld__input" data-action="pairing">${pairingOptions().map(([id, name]) => opt(id, state.pairingId, name)).join('')}</select>
      <span class="fld__hint">${escHtml(pairingNote(state.pairingId))}</span>
    </label></div></div>`;
}

/** Rebuild the whole form. Cheap enough to do on any structural change. */
export function renderEditor(root) {
  const d = design();
  const groups = groupsFor(d, state.meta);
  root.innerHTML = pairingHtml() + groups.map((g) => `
    <details class="editor__group" ${g.open ? 'open' : ''}>
      <summary class="editor__summary">${escHtml(g.title)}</summary>
      <div class="editor__body">${g.fields.map((field) => fieldHtml(field, d)).join('')}</div>
    </details>`).join('');
}

/* ── writes ────────────────────────────────────────────────────────────────── */

function castValue(el, cast) {
  if (el.type === 'checkbox') return el.checked;
  const raw = el.value;
  switch (cast) {
    case 'num': return Number(raw);
    case 'bool': return el.checked;
    case 'list': return splitList(raw);
    case 'yearOrNull': return raw === '' ? null : Math.round(Number(raw));
    case 'msOrNull': return raw === '' ? null : Number(raw);
    case 'numOrNull': return raw === '' ? null : Number(raw);
    default: return raw;
  }
}

/**
 * The three cross-field rules the deployment re-checks on create, on update and
 * again on publish. Keeping the form in step with them is not a substitute for
 * the server check: it stops the form offering a combination that would be
 * refused, which is a different job.
 */
function reconcileMeta() {
  const meta = state.meta;
  if (meta.category === 'recognition') { if (!meta.sphere) meta.sphere = 'work'; }
  else meta.sphere = null;
  if (meta.access === 'limited') { if (!meta.seats) meta.seats = 10; }
  else meta.seats = null;
  if (meta.category !== 'recognition' && meta.category !== 'meme') meta.stackable = false;
}

function applyWrite(el) {
  const path = el.dataset.path;
  if (!path) return false;
  const value = castValue(el, el.dataset.cast);
  if (path.startsWith('meta.')) {
    setPath({ meta: state.meta }, path, value);
    reconcileMeta();
  } else {
    setPath(design(), path, value);
  }
  state.dirty = true;
  return el.dataset.rerender === '1';
}

function applyToggle(el) {
  const path = el.dataset.toggle;
  const d = design();
  if (!el.checked) { setPath(d, path, null); state.dirty = true; return; }
  const groups = groupsFor(d, state.meta);
  for (const group of groups) {
    for (const field of group.fields) {
      if (field.type === 'toggle' && field.path === path && typeof field.make === 'function') {
        setPath(d, path, field.make());
        state.dirty = true;
        return;
      }
    }
  }
}

const RING_DEFAULT = () => ({ style: 'solid', width: 12, color: design().palette.accent, inset: 0 });

function applyAction(el, root) {
  const action = el.dataset.action;
  const d = design();
  switch (action) {
    case 'ring-add': d.rings.push(RING_DEFAULT()); break;
    case 'ring-remove': d.rings.splice(Number(el.dataset.index), 1); break;
    case 'sig-add': d.signatures.push({ name: '', role: '' }); break;
    case 'sig-remove': d.signatures.splice(Number(el.dataset.index), 1); break;
    case 'pairing': {
      state.pairingId = el.value;
      applyPairing(d, state.pairingId);
      break;
    }
    case 'seal-set': {
      if (el.value === '__keep') return true;
      if (!el.value) d.seal.design = null;
      else if (el.value === 'badge-draft') d.seal.design = clone(state.designs.badge);
      else {
        const found = presetsFor('badge').find((p) => p.id === el.value);
        d.seal.design = found ? clone(found.design) : null;
      }
      break;
    }
    default: return false;
  }
  state.dirty = true;
  renderEditor(root);
  notify();
  return true;
}

/** A pairing sets font roles and leaves every word, size and colour alone. */
export function applyPairing(d, id) {
  if (d.kind === 'certificate') {
    const roles = certificateFonts(id);
    for (const [slot, role] of Object.entries(roles)) {
      if (d.text[slot]) d.text[slot].font = role;
    }
    if (d.seal.design) applyPairing(d.seal.design, id);
    return;
  }
  const roles = badgeFonts(id);
  if (d.arcs.top) d.arcs.top.font = roles.arcTop;
  if (d.arcs.bottom) d.arcs.bottom.font = roles.arcBottom;
  if (d.ribbon) d.ribbon.font = roles.ribbon;
}

/* ── wiring ────────────────────────────────────────────────────────────────── */

/**
 * `onChange` is called after any write. `onArt` is called when the author asks
 * for an image, because uploading is the one control here that talks to the
 * deployment and that belongs to the page rather than to the form.
 */
export function initEditor(root, onChange, onArt) {
  notify = typeof onChange === 'function' ? onChange : () => {};
  onPickArt = typeof onArt === 'function' ? onArt : null;

  const handle = (event) => {
    const el = event.target.closest('[data-path], [data-toggle]');
    if (!el || !root.contains(el)) return;
    if (el.dataset.toggle) {
      applyToggle(el);
      renderEditor(root);
      notify();
      return;
    }
    const rerender = applyWrite(el);
    // Choosing "an image" with nothing attached leaves the document invalid
    // (C1.1: imageRef is required when the centre is an image), and the refusal
    // would arrive from the deployment on save. Ask for the file instead.
    if (el.dataset.path === 'centre.kind' && el.value === 'image' && !design().centre.imageRef) {
      renderEditor(root);
      notify();
      onPickArt?.('pick');
      return;
    }
    if (el.type === 'range') {
      const out = el.closest('.fld')?.querySelector('.fld__out');
      if (out) out.textContent = el.value;
    }
    if (el.type === 'color') {
      const hex = el.closest('.fld')?.querySelector('.fld__hex');
      if (hex) hex.textContent = el.value;
    }
    if (rerender) renderEditor(root);
    notify();
  };

  root.addEventListener('input', handle);
  root.addEventListener('change', handle);

  // Buttons act on click and selects act on change, and neither listener may
  // answer for the other: a click handler that matched a <select> re-rendered
  // the form while its list was open, which closed it before a choice landed.
  root.addEventListener('click', (event) => {
    const el = event.target.closest('button[data-action]');
    if (!el || !root.contains(el)) return;
    if (el.dataset.action === 'art-pick') { onArt?.('pick'); return; }
    if (el.dataset.action === 'art-clear') { onArt?.('clear'); return; }
    applyAction(el, root);
  });

  root.addEventListener('change', (event) => {
    const el = event.target.closest('select[data-action]');
    if (el && root.contains(el)) applyAction(el, root);
  });
}
