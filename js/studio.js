/**
 * The studio: the editor, the preview, and the two calls that put a design on
 * Sash. `index.html`.
 *
 * Saving is two mutations rather than one because the deployment holds a
 * template in two halves: `templates:updateMeta` for the words about the badge
 * and `versions:saveDraft` for the design itself, which writes to the template
 * row and never to `templateVersions`. Only `templates:publish` writes a
 * version, and a version is frozen the moment it exists (C2.4).
 */
import { api, m, q, failText } from './api.js';
import { state, design, setDesign, loadSaved, save, adoptTemplate } from './state.js';
import { initEditor, renderEditor, applyPairing } from './editor.js';
import { paintPreview, startFonts } from './preview.js';
import { presetGrid } from './render.js';
import { openModal, closeModal } from './events.js';
import { attachNewArt, pickImage } from './art.js';
import { presetDesign, randomDesign } from './insignia/data/presets.js';
import { debounce } from './neorgon-dom.js';
import { $, param, showToast } from './utils.js';

let editorRoot = null;
let previewHost = null;
let warnHost = null;

const repaint = debounce(() => {
  paintPreview(previewHost, warnHost);
  save();
  paintSaveState();
}, 90);

/* ── the save bar ──────────────────────────────────────────────────────────── */

function paintSaveState() {
  const el = $('saveState');
  if (!el) return;
  const bits = [];
  if (!state.templateId) bits.push('Not saved to Sash yet');
  else if (state.dirty) bits.push('Unsaved changes');
  else bits.push('Saved');
  if (state.publicId) bits.push(`id ${state.publicId}`);
  if (state.versionN) bits.push(`version ${state.versionN} published`);
  else if (state.templateId) bits.push('no version published');
  el.textContent = bits.join(' · ');

  const canWrite = state.session.signedIn;
  $('saveDraftBtn')?.toggleAttribute('disabled', !canWrite);
  $('publishBtn')?.toggleAttribute('disabled', !canWrite);
  const notice = $('handleNotice');
  if (notice) notice.hidden = !(canWrite && !state.session.handle);
}

function showBlocked(res) {
  const box = $('blockNotice');
  if (!box) return;
  if (!res) { box.hidden = true; return; }
  $('blockMessage').textContent = failText(res);
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ── saving ────────────────────────────────────────────────────────────────── */

function metaArgs() {
  const meta = state.meta;
  return {
    name: meta.name,
    description: meta.description,
    criteria: meta.criteria,
    skills: meta.skills,
    category: meta.category,
    sphere: meta.sphere,
    access: meta.access,
    seats: meta.seats,
    allowList: meta.allowList,
    stackable: meta.stackable,
    defaultValidityMs: meta.defaultValidityMs,
  };
}

/**
 * Save the design and its metadata, creating the template on the first call.
 * Returns a failure object, or `{ ok: true }`.
 */
async function saveToSash() {
  if (!state.meta.name.trim()) {
    return { ok: false, code: 'invalid', message: 'Give the template a name first. It is the line a claimer reads.' };
  }
  if (!state.templateId) {
    const created = await m(api.templates.create, { kind: state.kind, design: design(), ...metaArgs() });
    if (!created.ok) return created;
    state.templateId = created.templateId;
    state.publicId = created.publicId;
    state.templateKind = state.kind;
    state.status = 'draft';
    state.dirty = false;
    save();
    const url = new URL(location.href);
    url.searchParams.set('t', created.publicId);
    history.replaceState(null, '', url);
    return { ok: true };
  }

  const updated = await m(api.templates.updateMeta, { templateId: state.templateId, ...metaArgs() });
  if (!updated.ok) return updated;
  const saved = await m(api.versions.saveDraft, { templateId: state.templateId, design: design() });
  if (!saved.ok) return saved;
  state.dirty = false;
  save();
  return { ok: true };
}

async function onSaveDraft() {
  showBlocked(null);
  const result = await saveToSash();
  if (!result.ok) {
    showToast(failText(result));
    if (result.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  showToast('Draft saved.');
  paintSaveState();
}

async function onPublish() {
  showBlocked(null);
  const changelog = ($('changelogInput')?.value || '').trim();
  const saved = await saveToSash();
  if (!saved.ok) {
    closeModal('publishModal');
    showToast(failText(saved));
    if (saved.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  const published = await m(api.templates.publish, { templateId: state.templateId, changelog });
  closeModal('publishModal');
  if (!published.ok) {
    if (published.code === 'blocked-issuer') showBlocked(published);
    else showToast(failText(published));
    if (published.code === 'no-handle') $('handleNotice').hidden = false;
    return;
  }
  state.status = 'published';
  state.versionN = published.n;
  save();
  paintSaveState();
  showToast(`Published as version ${published.n}.`);
}

function openPublish() {
  const hint = $('publishHint');
  if (hint) {
    hint.textContent = state.versionN
      ? `This template is at version ${state.versionN}. Publishing writes version ${state.versionN + 1}.`
      : 'This writes version 1 and makes the template claimable.';
  }
  const box = $('changelogInput');
  if (box) box.value = state.versionN ? '' : 'First cut';
  openModal('publishModal');
}

/* ── art ───────────────────────────────────────────────────────────────────── */

/**
 * A centre of kind `image` with no `imageRef` is an invalid document (C1.1), so
 * an author who asks for an image and then does not supply one is put back on a
 * glyph rather than left holding something the deployment will refuse.
 */
function abandonImage() {
  const d = design();
  if (d.centre.kind === 'image' && !d.centre.imageRef) {
    d.centre.kind = 'glyph';
    renderEditor(editorRoot);
    repaint();
  }
}

async function onArt(what) {
  const d = design();
  if (what === 'clear') {
    d.centre.imageRef = null;
    d.centre.kind = 'glyph';
    state.artRef = null;
    state.artUrl = null;
    state.dirty = true;
    renderEditor(editorRoot);
    repaint();
    return;
  }
  if (!state.session.signedIn) { showToast('Sign in to upload an image.'); abandonImage(); return; }

  const file = await pickImage();
  if (!file) { abandonImage(); return; }
  // Art is attached to a template row, so a design with nowhere to live has to
  // land first. Saying so beats a refusal the author cannot act on.
  if (!state.templateId) {
    showToast('Saving this design first, so the image has somewhere to attach.');
    // The design on screen still has no imageRef, so it would be refused. Save
    // it as it was before the author asked for an image.
    const restore = d.centre.kind;
    d.centre.kind = 'glyph';
    const saved = await saveToSash();
    d.centre.kind = restore;
    if (!saved.ok) { showToast(failText(saved)); abandonImage(); return; }
  }
  showToast('Shrinking and uploading.');
  const result = await attachNewArt(state.templateId, file);
  if (!result.ok) { showToast(result.message); abandonImage(); return; }

  d.centre.kind = 'image';
  d.centre.imageRef = result.artRef;
  state.artRef = result.artRef;
  state.artUrl = result.previewUrl;
  state.dirty = true;
  renderEditor(editorRoot);
  repaint();
  showToast('Image attached. Save the draft to keep it in the design.');
}

/* ── presets, randomize, kind ──────────────────────────────────────────────── */

function openPresets() {
  const grid = $('presetGrid');
  if (grid) grid.replaceChildren(presetGrid(state.kind, state.presetId));
  openModal('presetModal');
}

function applyPreset(id) {
  setDesign(presetDesign(id));
  state.presetId = id;
  applyPairing(design(), state.pairingId);
  renderEditor(editorRoot);
  repaint();
  closeModal('presetModal');
  showToast('Preset applied. The words are yours to change.');
}

function onRandomize() {
  setDesign(randomDesign(state.kind));
  applyPairing(design(), state.pairingId);
  renderEditor(editorRoot);
  repaint();
}

function setKind(kind) {
  if (kind === state.kind) return;
  if (state.templateId && state.templateKind && state.templateKind !== kind) {
    // A template's kind is fixed on the server: publish refuses a badge row
    // holding a certificate design. Detaching is honest about what happens next.
    state.templateId = null;
    state.publicId = null;
    state.templateKind = null;
    state.status = 'draft';
    state.versionN = 0;
    const url = new URL(location.href);
    url.searchParams.delete('t');
    history.replaceState(null, '', url);
    showToast('A template keeps the kind it was made as, so this is a new design. The other one is untouched.');
  }
  state.kind = kind;
  paintKind();
  renderEditor(editorRoot);
  repaint();
}

/** The segmented control, in the class and in the accessibility tree. */
function paintKind() {
  for (const button of document.querySelectorAll('[data-kind]')) {
    const on = button.dataset.kind === state.kind;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

/* ── loading a template ────────────────────────────────────────────────────── */

async function loadTemplate(publicId) {
  // Opening a template replaces the design on screen, so a `?t=` link must not
  // quietly take an author's unsaved work with it. The URL keeps the id, so
  // saving and reloading opens it.
  if (state.dirty && state.publicId !== publicId) {
    showToast('There are unsaved changes here, so that link was not opened. Save this design first.');
    return;
  }
  const detail = await q(api.templates.get, { publicId });
  if (!detail) {
    showToast('That template is not readable from this account.');
    return;
  }
  adoptTemplate(detail);
  if (state.artRef && detail.artUrl) state.artUrl = detail.artUrl;
  paintKind();
  renderEditor(editorRoot);
  paintPreview(previewHost, warnHost);
  paintSaveState();
}

/* ── entry points ──────────────────────────────────────────────────────────── */

export async function start() {
  editorRoot = $('editorRoot');
  previewHost = $('preview');
  warnHost = $('warnings');
  loadSaved();
  startFonts();

  initEditor(editorRoot, repaint, onArt);
  renderEditor(editorRoot);
  paintPreview(previewHost, warnHost);
  paintSaveState();

  paintKind();
  for (const button of document.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => setKind(button.dataset.kind));
  }
  $('presetBtn')?.addEventListener('click', openPresets);
  $('randomBtn')?.addEventListener('click', onRandomize);
  $('saveDraftBtn')?.addEventListener('click', onSaveDraft);
  $('publishBtn')?.addEventListener('click', openPublish);
  $('publishConfirm')?.addEventListener('click', onPublish);
  $('presetGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (button) applyPreset(button.dataset.preset);
  });
}

/** Called after every session change, once the handle is known. */
export async function onSession() {
  paintSaveState();
  const wanted = param('t');
  if (wanted && state.session.signedIn && wanted !== state.publicId) {
    await loadTemplate(wanted);
  } else if (wanted && !state.templateId && !state.session.signedIn) {
    // A published template is readable by anyone, so an unsigned visitor
    // arriving on a link still gets to see it.
    await loadTemplate(wanted);
  }
}
